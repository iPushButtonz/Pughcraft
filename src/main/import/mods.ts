import { readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { readForgeModToml } from '@xmcl/mod-parser'
import type { DetectedMod } from '@shared/imports'
import { hashFile } from '../core/http'
import { listEntries, readEntry, type ZipSource } from './zipread'
import { KNOWN_CLIENT_ONLY, PLATFORM_IDS } from './clientmods'
import { lookupSides } from './modrinth'
import { logger } from '../log'

const log = logger('mods')

export interface ScannedMod extends DetectedMod {
  absPath: string
  sha1: string
  provides: string[]
  deps: { id: string; mandatory: boolean }[]
}

const stripBom = (s: string): string => s.replace(/^﻿/, '')

/**
 * Mod ids bundled inside a Fabric/Quilt jar ("jar-in-jar"), e.g. every Fabric API module.
 * They count as present when checking dependencies.
 */
async function nestedFabricIds(src: ZipSource, jars: { file?: string }[], depth = 0): Promise<string[]> {
  if (depth > 2) return []
  const ids: string[] = []
  for (const j of jars) {
    if (!j.file) continue
    try {
      const inner = await readEntry(src, j.file, 64 * 1024 * 1024)
      if (!inner) continue
      const meta = await readEntry(inner, 'fabric.mod.json')
      if (!meta) continue
      const parsed = JSON.parse(stripBom(meta.toString('utf8'))) as { id?: string; provides?: string[]; jars?: { file?: string }[] }
      if (parsed.id) ids.push(parsed.id)
      ids.push(...(parsed.provides ?? []))
      if (parsed.jars?.length) ids.push(...(await nestedFabricIds(inner, parsed.jars, depth + 1)))
    } catch {
      // A broken nested jar just doesn't count.
    }
  }
  return ids
}

/** Reads what a mod jar says about itself (id, version, side, dependencies). */
export async function scanModJar(absPath: string, file: string): Promise<ScannedMod> {
  const base: ScannedMod = {
    file,
    absPath,
    id: null,
    name: file.replace(/\.jar$/i, ''),
    version: null,
    loader: null,
    side: 'unknown',
    sideSource: null,
    sha1: await hashFile(absPath, 'sha1'),
    provides: [],
    deps: []
  }
  let entries: string[]
  try {
    entries = await listEntries(absPath)
  } catch {
    return base // Not a readable jar; leave it for the server to judge.
  }
  const has = new Set(entries)
  try {
    if (has.has('fabric.mod.json')) {
      const j = JSON.parse(stripBom((await readEntry(absPath, 'fabric.mod.json'))!.toString('utf8'))) as {
        id?: string
        name?: string
        version?: string
        environment?: string
        depends?: Record<string, unknown>
        provides?: string[]
        jars?: { file?: string }[]
      }
      const env = j.environment ?? '*'
      return {
        ...base,
        id: j.id ?? null,
        name: j.name ?? j.id ?? base.name,
        version: j.version ?? null,
        loader: 'fabric',
        side: env === 'client' ? 'client' : env === 'server' ? 'server' : 'both',
        sideSource: 'manifest',
        provides: [...(j.provides ?? []), ...(await nestedFabricIds(absPath, j.jars ?? []))],
        deps: Object.keys(j.depends ?? {}).map((id) => ({ id, mandatory: true }))
      }
    }
    if (has.has('quilt.mod.json')) {
      const j = JSON.parse(stripBom((await readEntry(absPath, 'quilt.mod.json'))!.toString('utf8'))) as {
        quilt_loader?: {
          id?: string
          version?: string
          metadata?: { name?: string }
          depends?: (string | { id: string; optional?: boolean })[]
          provides?: (string | { id: string })[]
        }
        minecraft?: { environment?: string }
      }
      const q = j.quilt_loader ?? {}
      const env = j.minecraft?.environment ?? '*'
      return {
        ...base,
        id: q.id ?? null,
        name: q.metadata?.name ?? q.id ?? base.name,
        version: q.version ?? null,
        loader: 'quilt',
        side: env === 'client' ? 'client' : env === 'dedicated_server' ? 'server' : 'both',
        sideSource: 'manifest',
        provides: (q.provides ?? []).map((p) => (typeof p === 'string' ? p : p.id)),
        deps: (q.depends ?? []).map((d) =>
          typeof d === 'string' ? { id: d, mandatory: true } : { id: d.id, mandatory: !d.optional }
        )
      }
    }
    const tomlName = has.has('META-INF/neoforge.mods.toml')
      ? 'META-INF/neoforge.mods.toml'
      : has.has('META-INF/mods.toml')
        ? 'META-INF/mods.toml'
        : null
    if (tomlName) {
      const [m] = await readForgeModToml(absPath, undefined, tomlName)
      if (m) {
        return {
          ...base,
          id: m.modid ?? null,
          name: m.displayName || m.modid || base.name,
          version: m.version && !m.version.includes('${') ? m.version : null,
          loader: tomlName.includes('neoforge') ? 'neoforge' : 'forge',
          provides: m.provides ?? [],
          deps: (m.dependencies ?? [])
            .filter((d) => d.side !== 'CLIENT')
            .map((d) => ({ id: d.modId, mandatory: d.mandatory !== false }))
        }
      }
    }
    if (has.has('mcmod.info')) {
      const raw = JSON.parse(stripBom((await readEntry(absPath, 'mcmod.info'))!.toString('utf8'))) as
        | { modid?: string; name?: string; version?: string; requiredMods?: string[] }[]
        | { modList?: { modid?: string; name?: string; version?: string; requiredMods?: string[] }[] }
      const m = (Array.isArray(raw) ? raw : (raw.modList ?? []))[0]
      if (m) {
        return {
          ...base,
          id: m.modid ?? null,
          name: m.name ?? m.modid ?? base.name,
          version: m.version && !m.version.includes('${') ? m.version : null,
          loader: 'forge',
          deps: (m.requiredMods ?? []).map((id) => ({ id: id.split('@')[0], mandatory: true }))
        }
      }
    }
  } catch (err) {
    log.warn(`could not read mod info from ${file}`, err)
  }
  return base
}

/** Every .jar directly inside `modsDir` (not in sub-folders; loaders ignore those). */
export async function listModJars(modsDir: string): Promise<string[]> {
  try {
    const names = await readdir(modsDir)
    const jars: string[] = []
    for (const n of names) {
      if (!/\.jar$/i.test(n)) continue
      if ((await stat(join(modsDir, n))).isFile()) jars.push(join(modsDir, n))
    }
    return jars
  } catch {
    return []
  }
}

/**
 * Scans a mods folder and works out which mods only belong in the game:
 * 1) what each mod says about itself, 2) Modrinth's records, 3) the built-in list.
 */
export async function scanModsFolder(
  modsDir: string,
  onProgress?: (done: number, total: number) => void
): Promise<ScannedMod[]> {
  const jars = await listModJars(modsDir)
  const mods: ScannedMod[] = []
  for (const [i, jar] of jars.entries()) {
    mods.push(await scanModJar(jar, relative(modsDir, jar)))
    onProgress?.(i + 1, jars.length)
  }
  await classifySides(mods)
  return mods
}

export async function classifySides(mods: ScannedMod[]): Promise<void> {
  const unsure = mods.filter((m) => m.sideSource !== 'manifest' || m.side === 'both')
  if (unsure.length > 0) {
    const sides = await lookupSides(unsure.map((m) => m.sha1))
    for (const m of unsure) {
      const s = sides.get(m.sha1)
      if (s && (m.side === 'unknown' || s !== 'both')) {
        // Modrinth only overrides a mod's own "both" when it's certain it's one-sided.
        if (m.sideSource === 'manifest' && s === 'unknown') continue
        m.side = s
        m.sideSource = 'modrinth'
      }
    }
  }
  for (const m of mods) {
    if (m.side === 'unknown' && m.id && KNOWN_CLIENT_ONLY.has(m.id.toLowerCase())) {
      m.side = 'client'
      m.sideSource = 'list'
    }
  }
  // A server mod that needs a "client-only" mod proves that mod belongs on the server too.
  const needed = new Set(
    mods.filter((m) => m.side !== 'client').flatMap((m) => m.deps.filter((d) => d.mandatory).map((d) => d.id))
  )
  for (const m of mods) {
    if (m.side === 'client' && m.id && needed.has(m.id)) m.side = 'both'
  }
}

/** Mods that appear more than once (usually two versions of the same mod), by display name. */
export function duplicateMods(mods: ScannedMod[]): string[] {
  const seen = new Map<string, ScannedMod[]>()
  for (const m of mods) {
    if (!m.id) continue
    seen.set(m.id, [...(seen.get(m.id) ?? []), m])
  }
  return [...seen.values()].filter((list) => list.length > 1).map((list) => list[0].name)
}

/** Mandatory dependencies nothing in `mods` provides. */
export function missingDependencies(mods: ScannedMod[]): { id: string; requiredBy: string }[] {
  const present = new Set<string>()
  for (const m of mods) {
    if (m.id) present.add(m.id)
    for (const p of m.provides) present.add(p)
  }
  // Fabric API is known by both names.
  if (present.has('fabric-api')) present.add('fabric')
  if (present.has('fabric')) present.add('fabric-api')
  const missing = new Map<string, string>()
  for (const m of mods) {
    for (const d of m.deps) {
      if (!d.mandatory || PLATFORM_IDS.has(d.id) || present.has(d.id)) continue
      if (!missing.has(d.id)) missing.set(d.id, m.name)
    }
  }
  return [...missing].map(([id, requiredBy]) => ({ id, requiredBy }))
}
