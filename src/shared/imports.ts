import type { Loader } from './servers'

/** What a dropped or picked source turned out to be. */
export type ImportKind = 'world' | 'server' | 'mrpack' | 'curseforge' | 'instance'

export type ModSide = 'client' | 'server' | 'both' | 'unknown'

export interface DetectedMod {
  /** Path relative to the source's mods folder (or pack file path). */
  file: string
  id: string | null
  name: string
  version: string | null
  loader: 'fabric' | 'quilt' | 'forge' | 'neoforge' | null
  side: ModSide
  /** Where the side came from: the mod itself, Modrinth, or the built-in list. */
  sideSource: 'manifest' | 'modrinth' | 'pack' | 'list' | null
}

export interface ImportAnalysis {
  id: string
  sourcePath: string
  sourceLabel: string
  kind: ImportKind
  /** Suggested server name. */
  name: string
  mcVersion: string | null
  loader: Exclude<Loader, 'custom'> | 'custom' | null
  loaderVersion: string | null
  world: {
    levelName: string
    sizeBytes: number
    /** Brands the world was last played with, e.g. ["vanilla"] or ["fabric"]. */
    brands: string[]
    wasModded: boolean
  } | null
  mods: DetectedMod[]
  plugins: string[]
  /** Other worlds found inside (instances: the "saves" folder). */
  worlds: { folder: string; levelName: string; mcVersion: string | null }[]
  sizeBytes: number
  /** Plain-English reasons the import can't go ahead as-is. */
  problems: string[]
  /** Plain-English things worth knowing. */
  warnings: string[]
  /** Declared dependencies no mod in the set provides. */
  missingDependencies: { id: string; requiredBy: string }[]
  /** Extra copies of mods that are there twice; left out on import. */
  duplicateCopies: number
}

export type ImportTarget = { kind: 'new' } | { kind: 'existing'; serverId: string }

export interface ImportRequest {
  analysisId: string
  target: ImportTarget
  name: string
  mcVersion: string
  loader: Exclude<Loader, 'custom'> | 'custom'
  loaderVersion: string | null
  memoryMb: number
  /** Leave client-only mods out of the server (they're kept aside, never deleted). */
  removeClientMods: boolean
  /** Instances: which saved world to bring along, if any. */
  worldFolder: string | null
  acceptEula: boolean
}

export type Launcher = 'official' | 'prism' | 'curseforge' | 'modrinth'

/** Something the PC scan found in an installed launcher. */
export interface FoundItem {
  kind: 'world' | 'instance'
  launcher: Launcher
  name: string
  path: string
  /** Instance the world belongs to, if any. */
  instance: string | null
  mcVersion: string | null
  loader: string | null
  lastPlayed: string | null
}

export interface WorldInfo {
  /** Folder name inside the server (active) or the worlds store (inactive). */
  slot: string
  levelName: string
  active: boolean
  sizeBytes: number
  mcVersion: string | null
  lastPlayed: string | null
}
