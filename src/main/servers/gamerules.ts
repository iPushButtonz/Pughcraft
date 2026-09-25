import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { deserialize } from '@xmcl/nbt'
import {
  GAME_RULES,
  GAME_RULES_BY_ID,
  type GameRuleDef,
  type GameRuleState,
  type GameRuleValue,
  type GameRulesView
} from '@shared/gamerules'
import { logger } from '../log'
import type { ServerManager } from './manager'

const log = logger('gamerules')

/** "Gamerule keep_inventory is currently set to: false" (1.13+) or "keepInventory = false" (older). */
const QUERY_REPLY = /(?:Gamerule (\S+) is currently set to: (\S+)|\]: (\w+) = (\S+)$)/
const SET_REPLY = /Game ?rule \S+ (?:is now set to|has been updated to):? \S+/i
/** Errors a query for a name this version doesn't have produces; claimed so they stay out of the console. */
const QUERY_NOISE = /Incorrect argument for command|Unknown or incomplete command|Unknown (?:game ?rule|argument)|<--\[HERE\]|No game rule called|is not a valid game ?rule/i

const parse = (raw: string, def: GameRuleDef): GameRuleValue | null => {
  if (def.type === 'bool') return raw === 'true' || raw === '1' ? true : raw === 'false' || raw === '0' ? false : null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** A name from a def's list, and whether it means the opposite ("!disableRaids"). */
const nameInfo = (entry: string): { name: string; inverted: boolean } =>
  entry.startsWith('!') ? { name: entry.slice(1), inverted: true } : { name: entry, inverted: false }

/** For each rule, the name this server's version uses (learned from a live query or the world files). */
type Resolved = Map<string, { name: string; inverted: boolean }>

/**
 * Game rules live in the world, so while a server runs they're read and changed through its
 * console (quietly, so the console stays clean). While it's stopped, values come from the
 * world files, and changes wait in pughcraft.json until the next start.
 */
export class GameRuleManager extends EventEmitter<{ changed: [serverId: string] }> {
  private readonly resolved = new Map<string, { mcVersion: string; names: Resolved }>()

  constructor(private readonly servers: ServerManager) {
    super()
    const last = new Map<string, string>()
    servers.on('changed', (s) => {
      const prev = last.get(s.config.id)
      last.set(s.config.id, s.status)
      if (s.status === 'running' && prev !== 'running') void this.applyPending(s.config.id)
    })
  }

  private namesFor(id: string): Resolved | null {
    const r = this.resolved.get(id)
    return r && r.mcVersion === this.servers.get(id).config.mcVersion ? r.names : null
  }

  /** Asks the running server for every rule, under every name it might have. */
  private async queryLive(id: string): Promise<Map<string, GameRuleValue>> {
    const byName = new Map<string, { def: GameRuleDef; inverted: boolean }>()
    for (const def of GAME_RULES) {
      for (const entry of def.names) {
        const { name, inverted } = nameInfo(entry)
        if (!byName.has(name)) byName.set(name, { def, inverted })
      }
    }
    const lines = await this.servers.quiet(
      id,
      [...byName.keys()].map((name) => `gamerule ${name}`),
      (text) => QUERY_REPLY.test(text) || QUERY_NOISE.test(text),
      1500
    )
    const values = new Map<string, GameRuleValue>()
    const names: Resolved = new Map()
    for (const line of lines) {
      const m = QUERY_REPLY.exec(line)
      if (!m) continue
      const name = (m[1] ?? m[3]).replace(/^minecraft:/, '')
      const raw = m[2] ?? m[4]
      const hit = byName.get(name)
      if (!hit || names.has(hit.def.id)) continue
      const v = parse(raw, hit.def)
      if (v === null) continue
      names.set(hit.def.id, { name, inverted: hit.inverted })
      values.set(hit.def.id, hit.inverted && typeof v === 'boolean' ? !v : v)
    }
    if (names.size) this.resolved.set(id, { mcVersion: this.servers.get(id).config.mcVersion, names })
    return values
  }

  /** Reads the stopped world's rules: 26.x keeps them in data/minecraft/game_rules.dat, older worlds in level.dat. */
  private async readFromWorld(id: string): Promise<Map<string, GameRuleValue> | null> {
    const world = await this.servers.activeWorldDir(id)
    const nbt = async (file: string): Promise<Record<string, unknown> | null> => {
      if (!existsSync(file)) return null
      const data = await readFile(file)
      const plain = data[0] === 0x1f && data[1] === 0x8b ? gunzipSync(data) : data
      return deserialize<Record<string, unknown>>(plain)
    }
    try {
      let raw: Record<string, unknown> | null = null
      const modern = await nbt(join(world, 'data', 'minecraft', 'game_rules.dat'))
      if (modern) raw = (modern.data as Record<string, unknown>) ?? modern
      else {
        const level = await nbt(join(world, 'level.dat'))
        if (!level) return null
        raw = ((level.Data as Record<string, unknown>)?.GameRules as Record<string, unknown>) ?? {}
      }
      const values = new Map<string, GameRuleValue>()
      const names: Resolved = new Map()
      for (const def of GAME_RULES) {
        for (const entry of def.names) {
          const { name, inverted } = nameInfo(entry)
          const value = raw[`minecraft:${name}`] ?? raw[name]
          if (value === undefined) continue
          const v = parse(String(value), def)
          if (v === null) continue
          names.set(def.id, { name, inverted })
          values.set(def.id, inverted && typeof v === 'boolean' ? !v : v)
          break
        }
      }
      if (names.size) this.resolved.set(id, { mcVersion: this.servers.get(id).config.mcVersion, names })
      return values
    } catch (err) {
      log.warn(`could not read game rules of ${id}`, err)
      return null
    }
  }

  async view(id: string): Promise<GameRulesView> {
    const running = this.servers.get(id).status === 'running'
    const values = running ? await this.queryLive(id) : await this.readFromWorld(id)
    const pending = this.servers.pendingGameRules(id)
    const rules: GameRuleState[] = []
    for (const def of GAME_RULES) {
      const has = values?.has(def.id)
      if (!has && !(def.id in pending)) continue
      const p = pending[def.id]
      rules.push({ id: def.id, value: p !== undefined ? p : (values?.get(def.id) ?? null), pending: p !== undefined })
    }
    return { running, known: !!values && values.size > 0, rules }
  }

  private validate(ruleId: string, value: unknown): { def: GameRuleDef; value: GameRuleValue } {
    const def = GAME_RULES_BY_ID[ruleId]
    if (!def) throw new Error('Unknown game rule.')
    if (def.type === 'bool') {
      if (typeof value !== 'boolean') throw new Error('Expected on or off.')
      return { def, value }
    }
    const n = Number(value)
    if (!Number.isInteger(n) || n < (def.min ?? 0) || n > (def.max ?? 2147483647)) {
      throw new Error(`Pick a whole number from ${def.min ?? 0} to ${def.max ?? 2147483647}.`)
    }
    return { def, value: n }
  }

  /** Sets one rule: right away if the server runs, otherwise on its next start. */
  async set(id: string, ruleId: string, value: unknown): Promise<GameRulesView> {
    const v = this.validate(ruleId, value)
    if (this.servers.get(id).status === 'running') {
      await this.applyNow(id, v.def, v.value)
      const pending = this.servers.pendingGameRules(id)
      delete pending[ruleId]
      await this.servers.setPendingGameRules(id, pending)
    } else {
      await this.servers.setPendingGameRules(id, { ...this.servers.pendingGameRules(id), [ruleId]: v.value })
    }
    this.emit('changed', id)
    return this.view(id)
  }

  /** Puts every rule back to vanilla's default. */
  async resetAll(id: string): Promise<GameRulesView> {
    const current = await this.view(id)
    if (this.servers.get(id).status === 'running') {
      for (const r of current.rules) {
        const def = GAME_RULES_BY_ID[r.id]
        if (r.value !== def.default) await this.applyNow(id, def, def.default)
      }
      await this.servers.setPendingGameRules(id, {})
    } else {
      const pending: Record<string, boolean | number> = {}
      for (const r of current.rules) {
        const def = GAME_RULES_BY_ID[r.id]
        if (r.value !== def.default) pending[r.id] = def.default
      }
      await this.servers.setPendingGameRules(id, pending)
    }
    this.emit('changed', id)
    return this.view(id)
  }

  private async applyNow(id: string, def: GameRuleDef, value: GameRuleValue): Promise<void> {
    let names = this.namesFor(id)
    if (!names?.has(def.id)) {
      await this.queryLive(id)
      names = this.namesFor(id)
    }
    const n = names?.get(def.id)
    if (!n) throw new Error('This Minecraft version doesn’t have that game rule.')
    const raw = n.inverted && typeof value === 'boolean' ? !value : value
    const lines = await this.servers.quiet(
      id,
      [`gamerule ${n.name} ${raw}`],
      (text) => SET_REPLY.test(text) || QUERY_NOISE.test(text),
      1500
    )
    if (!lines.some((l) => SET_REPLY.test(l))) throw new Error('The server didn’t accept that change.')
  }

  /** Applies changes saved while the server was stopped, once it's up. */
  private async applyPending(id: string): Promise<void> {
    const pending = this.servers.pendingGameRules(id)
    const ids = Object.keys(pending)
    if (!ids.length) return
    const left: Record<string, boolean | number> = {}
    for (const ruleId of ids) {
      const def = GAME_RULES_BY_ID[ruleId]
      if (!def) continue
      try {
        await this.applyNow(id, def, pending[ruleId])
      } catch (err) {
        log.warn(`could not apply game rule ${ruleId} on ${id}: ${(err as Error).message}`)
        if (this.servers.get(id).status === 'running') continue
        left[ruleId] = pending[ruleId]
      }
    }
    await this.servers.setPendingGameRules(id, left)
    this.servers.appNote(id, `Applied ${ids.length - Object.keys(left).length} game rule change${ids.length === 1 ? '' : 's'} saved while the server was stopped.`)
    this.emit('changed', id)
  }
}
