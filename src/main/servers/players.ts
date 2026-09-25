import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isIP } from 'node:net'
import type {
  IpBan,
  JoinRequest,
  PlayerActionRequest,
  PlayerEntry,
  PlayersView
} from '@shared/players'
import type { ConsoleLine } from '@shared/servers'
import { getJson, HttpError } from '../core/http'
import { logger } from '../log'
import type { ServerManager } from './manager'

const log = logger('players')

const NAME = /^[A-Za-z0-9_]{1,16}$/
/** Requests older than this drop off the list. */
const REQUEST_TTL_MS = 10 * 60 * 1000

/**
 * A join the whitelist turned away, from the server's own log line. Anchored on "]: " so
 * chat ("<Bob> Disconnecting Alex ...") can't fake it. Formats seen across versions:
 *   Disconnecting Alex (/1.2.3.4:5678): You are not white-listed on this server!
 *   Disconnecting com.mojang.authlib.GameProfile@1a2b[id=…,name=Alex,…] (/1.2.3.4:5678): You are not white-listed…
 *   Disconnecting GameProfile[id=…, name=Alex, …] (/1.2.3.4:5678): …
 *   com.mojang.authlib.GameProfile@1a2b[id=…,name=Alex,…] (/1.2.3.4:5678) lost connection: You are not white-listed…
 *   Alex (/1.2.3.4:5678) lost connection: You are not whitelisted on this server!   (Paper)
 */
export function deniedJoinName(line: string): string | null {
  if (!/not white-?listed/i.test(line)) return null
  const body = /\]: (.*)$/.exec(line)?.[1]
  if (!body || body.startsWith('<') || body.startsWith('[Not Secure]') || body.startsWith('[Server]')) return null
  const profile = /^(?:Disconnecting )?(?:com\.mojang\.authlib\.)?GameProfile[@\w]*\[[^\]]*?name=([A-Za-z0-9_]{1,16})/.exec(body)
  if (profile) return profile[1]
  const plain = /^(?:Disconnecting )?([A-Za-z0-9_]{1,16}) \(/.exec(body)
  return plain ? plain[1] : null
}

/** Java's UUID.nameUUIDFromBytes("OfflinePlayer:" + name): the id an offline-mode server gives a player. */
export function offlineUuid(name: string): string {
  const b = createHash('md5').update(`OfflinePlayer:${name}`).digest()
  b[6] = (b[6] & 0x0f) | 0x30
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const dashed = (id: string): string =>
  id.includes('-') ? id : `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`

/** "2026-09-24 11:00:00 -0400", the date format Minecraft writes in ban lists. */
function banDate(d = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ` +
    `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`
  )
}

type JsonList = Record<string, unknown>[]

const FILES = {
  whitelist: 'whitelist.json',
  ops: 'ops.json',
  bans: 'banned-players.json',
  ipBans: 'banned-ips.json'
} as const

/** Success messages from the server, across versions, for commands we send. */
const DONE =
  /(Added|Removed) \S+ (to|from) the whitelist|Player is (already|not) whitelisted|Made \S+ (a|no longer a) server operator|Nothing changed|(De-)?[Oo]pped \S+|Banned|Unbanned|Kicked|Could not ban|That player does not exist|No player was found|Invalid IP/

/**
 * Whitelist, operators and bans. While the server runs, changes go through its console so
 * its in-memory lists stay right; while it's stopped, the JSON files are edited directly.
 */
export class PlayerManager extends EventEmitter<{ changed: [serverId: string]; request: [JoinRequest] }> {
  private readonly requests = new Map<string, JoinRequest[]>()

  constructor(private readonly servers: ServerManager) {
    super()
    servers.on('console', ({ id, lines }) => this.onLines(id, lines))
    servers.on('changed', (s) => {
      // Joins and leaves change the online list.
      if (s.status === 'running' || s.status === 'stopped') this.emit('changed', s.config.id)
    })
  }

  private dir(id: string): string {
    return this.servers.serverDir(id)
  }

  private async readList(id: string, file: string): Promise<JsonList> {
    try {
      const data = JSON.parse(await readFile(join(this.dir(id), file), 'utf8')) as unknown
      return Array.isArray(data) ? (data as JsonList) : []
    } catch {
      return []
    }
  }

  private async writeList(id: string, file: string, list: JsonList): Promise<void> {
    const path = join(this.dir(id), file)
    await writeFile(`${path}.tmp`, JSON.stringify(list, null, 2))
    await rename(`${path}.tmp`, path)
  }

  private async props(id: string): Promise<{ whitelistOn: boolean; offlineMode: boolean }> {
    const raw = (await this.servers.properties(id)).raw
    const get = (k: string): string | undefined => new RegExp(`^${k}=(.*)$`, 'm').exec(raw)?.[1]?.trim()
    return { whitelistOn: get('white-list') === 'true', offlineMode: get('online-mode') === 'false' }
  }

  private recent(id: string): JoinRequest[] {
    const now = Date.now()
    const list = (this.requests.get(id) ?? []).filter((r) => now - Date.parse(r.at) < REQUEST_TTL_MS)
    this.requests.set(id, list)
    return list
  }

  async view(id: string): Promise<PlayersView> {
    const s = this.servers.get(id)
    const entry = (x: Record<string, unknown>, detail: unknown = null): PlayerEntry => ({
      name: String(x.name ?? '?'),
      uuid: typeof x.uuid === 'string' ? x.uuid : null,
      detail: detail === null || detail === undefined ? null : String(detail)
    })
    const [wl, ops, bans, ipBans, p] = await Promise.all([
      this.readList(id, FILES.whitelist),
      this.readList(id, FILES.ops),
      this.readList(id, FILES.bans),
      this.readList(id, FILES.ipBans),
      this.props(id)
    ])
    return {
      running: s.status === 'running',
      whitelistOn: p.whitelistOn,
      offlineMode: p.offlineMode,
      online: s.players,
      whitelist: wl.map((x) => entry(x)),
      ops: ops.map((x) => entry(x, x.level)),
      bans: bans.map((x) => entry(x, x.reason)),
      ipBans: ipBans.map((x): IpBan => ({ ip: String(x.ip ?? '?'), reason: typeof x.reason === 'string' ? x.reason : null })),
      requests: this.recent(id)
    }
  }

  private onLines(id: string, lines: ConsoleLine[]): void {
    for (const line of lines) {
      if (line.source === 'app') continue
      const name = deniedJoinName(line.text)
      if (!name) continue
      const list = this.recent(id).filter((r) => r.name.toLowerCase() !== name.toLowerCase())
      const req: JoinRequest = { serverId: id, name, at: new Date().toISOString() }
      this.requests.set(id, [req, ...list].slice(0, 20))
      log.info(`${name} was turned away by the whitelist on ${id}`)
      this.emit('request', req)
      this.emit('changed', id)
    }
  }

  dismissRequest(id: string, name: string): void {
    this.requests.set(
      id,
      this.recent(id).filter((r) => r.name.toLowerCase() !== name.toLowerCase())
    )
    this.emit('changed', id)
  }

  /** The player's real UUID from Mojang (online mode), or the offline-mode one. */
  private async profile(id: string, name: string): Promise<{ uuid: string; name: string }> {
    if ((await this.props(id)).offlineMode) return { uuid: offlineUuid(name), name }
    try {
      const p = await getJson<{ id: string; name: string }>(
        `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`
      )
      if (!p?.id) throw new Error('not found')
      return { uuid: dashed(p.id), name: p.name }
    } catch (err) {
      if (err instanceof HttpError && err.status !== 404 && err.status !== 204) {
        throw new Error("Couldn't reach Mojang to look up that player. Check your internet, or start the server and try again.")
      }
      throw new Error(`There's no Minecraft account called “${name}”.`)
    }
  }

  async act(id: string, req: PlayerActionRequest): Promise<PlayersView> {
    const target = req.target.trim()
    const ipAction = req.action === 'ban-ip' || req.action === 'pardon-ip'
    if (ipAction ? !isIP(target) : !NAME.test(target)) {
      throw new Error(ipAction ? 'That isn’t an IP address.' : 'Minecraft names are 1–16 letters, numbers or _.')
    }
    const reason = (req.reason ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200)
    if (this.servers.get(id).status === 'running') await this.viaConsole(id, req.action, target, reason)
    else await this.viaFiles(id, req.action, target, reason)
    if (req.action === 'whitelist-add') this.dismissRequest(id, target)
    this.emit('changed', id)
    return this.view(id)
  }

  private async viaConsole(id: string, action: PlayerActionRequest['action'], target: string, reason: string): Promise<void> {
    const command = {
      'whitelist-add': `whitelist add ${target}`,
      'whitelist-remove': `whitelist remove ${target}`,
      op: `op ${target}`,
      deop: `deop ${target}`,
      ban: `ban ${target}${reason ? ` ${reason}` : ''}`,
      pardon: `pardon ${target}`,
      'ban-ip': `ban-ip ${target}${reason ? ` ${reason}` : ''}`,
      'pardon-ip': `pardon-ip ${target}`,
      kick: `kick ${target}${reason ? ` ${reason}` : ''}`
    }[action]
    const done = this.servers.waitForConsole(id, DONE, 15_000)
    this.servers.command(id, command)
    const ok = await done
    // The server writes its JSON file right after the command; give it a moment.
    await new Promise((r) => setTimeout(r, ok ? 300 : 0))
    if (!ok) throw new Error('The server didn’t answer. It may still be busy; check the Console tab.')
  }

  private async viaFiles(id: string, action: PlayerActionRequest['action'], target: string, reason: string): Promise<void> {
    const lower = target.toLowerCase()
    const without = (list: JsonList, key = 'name'): JsonList =>
      list.filter((x) => String(x[key] ?? '').toLowerCase() !== lower)
    switch (action) {
      case 'kick':
        throw new Error('The server isn’t running, so nobody can be kicked.')
      case 'whitelist-add': {
        const p = await this.profile(id, target)
        const list = await this.readList(id, FILES.whitelist)
        await this.writeList(id, FILES.whitelist, [...without(list), { uuid: p.uuid, name: p.name }])
        return
      }
      case 'whitelist-remove':
        await this.writeList(id, FILES.whitelist, without(await this.readList(id, FILES.whitelist)))
        return
      case 'op': {
        const p = await this.profile(id, target)
        const list = await this.readList(id, FILES.ops)
        await this.writeList(id, FILES.ops, [...without(list), { uuid: p.uuid, name: p.name, level: 4, bypassesPlayerLimit: false }])
        return
      }
      case 'deop':
        await this.writeList(id, FILES.ops, without(await this.readList(id, FILES.ops)))
        return
      case 'ban': {
        const p = await this.profile(id, target)
        const list = await this.readList(id, FILES.bans)
        await this.writeList(id, FILES.bans, [
          ...without(list),
          { uuid: p.uuid, name: p.name, created: banDate(), source: 'Server', expires: 'forever', reason: reason || 'Banned by an operator.' }
        ])
        return
      }
      case 'pardon':
        await this.writeList(id, FILES.bans, without(await this.readList(id, FILES.bans)))
        return
      case 'ban-ip': {
        const list = await this.readList(id, FILES.ipBans)
        await this.writeList(id, FILES.ipBans, [
          ...without(list, 'ip'),
          { ip: target, created: banDate(), source: 'Server', expires: 'forever', reason: reason || 'Banned by an operator.' }
        ])
        return
      }
      case 'pardon-ip':
        await this.writeList(id, FILES.ipBans, without(await this.readList(id, FILES.ipBans), 'ip'))
        return
    }
  }

  /** Whether the server has any of the list files yet (a brand-new server doesn't until first start). */
  hasFiles(id: string): boolean {
    return Object.values(FILES).some((f) => existsSync(join(this.dir(id), f)))
  }
}
