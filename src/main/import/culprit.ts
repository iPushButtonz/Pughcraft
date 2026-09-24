import { basename } from 'node:path'
import { listModJars, scanModJar } from './mods'

/**
 * Reads a startup crash and, if a mod that only works inside the game broke the server,
 * returns that mod's jar so it can be set aside. Returns null when unsure; the crash is
 * then explained normally instead of guessing.
 */

const CLIENT_CLASS_CRASH = [
  /Attempted to load class net\/minecraft\/client\/\S+ for invalid dist DEDICATED_SERVER/,
  /invalid dist DEDICATED_SERVER/,
  /Cannot load class \S*net\/minecraft\/client\/\S* in environment type SERVER/,
  /Environment type SERVER is not allowed/i,
  /NoClassDefFoundError: net\/minecraft\/client\//,
  /ClassNotFoundException: net\.minecraft\.client\./
]

/** Mod ids a crash report points at, most specific first. */
export function suspectIds(tail: string[]): string[] {
  const text = tail.join('\n')
  const ids: string[] = []
  const patterns = [
    /ModID: (\S+?)[,\s]/g,
    /Mod ID: '([^']+)'/g,
    /provided by '([^']+)'/g,
    /for mod '?([a-z0-9_\-.]+)'?/gi,
    /Mixin \[([a-z0-9_\-.]+?)\.mixins\.json/gi,
    /([a-z0-9_\-]+)\.mixins\.json/gi,
    /\(([a-z0-9_\-]+)\) failed/gi
  ]
  for (const re of patterns) for (const m of text.matchAll(re)) ids.push(m[1].toLowerCase())
  return [...new Set(ids.filter((id) => !['minecraft', 'forge', 'neoforge', 'fabricloader', 'mixin'].includes(id)))]
}

export function isClientClassCrash(tail: string[]): boolean {
  const text = tail.join('\n')
  return CLIENT_CLASS_CRASH.some((re) => re.test(text))
}

export async function findClientOnlyCulprit(tail: string[], modsDir: string): Promise<{ file: string; name: string } | null> {
  if (!isClientClassCrash(tail)) return null
  const ids = suspectIds(tail)
  if (ids.length === 0) return null
  const jars = await listModJars(modsDir)
  for (const jar of jars) {
    const mod = await scanModJar(jar, basename(jar))
    const candidates = [mod.id, ...mod.provides].filter(Boolean).map((x) => x!.toLowerCase())
    if (candidates.some((c) => ids.includes(c))) return { file: jar, name: mod.name }
  }
  // Mixin configs are often named after the jar rather than the mod id.
  const byFile = jars.find((j) => ids.some((id) => basename(j).toLowerCase().startsWith(id)))
  return byFile ? { file: byFile, name: basename(byFile) } : null
}
