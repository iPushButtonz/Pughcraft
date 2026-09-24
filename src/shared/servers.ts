import type { ServerNetworkConfig } from './network'
import type { BackupSchedule } from './backups'

export type Loader = 'vanilla' | 'paper' | 'fabric' | 'forge' | 'neoforge' | 'custom'

export const LOADER_LABELS: Record<Loader, string> = {
  vanilla: 'Vanilla',
  paper: 'Paper',
  fabric: 'Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge',
  custom: 'Custom'
}

/** How to start the server once it's installed. */
export type LaunchSpec =
  | { kind: 'jar'; jar: string }
  /** Forge/NeoForge 1.17+: `@<dir>/win_args.txt` or `unix_args.txt`, plus `@user_jvm_args.txt`. */
  | { kind: 'argsfile'; dir: string }

/** Stored as `pughcraft.json` next to each server's files. */
export interface ServerConfig {
  schema: 1
  id: string
  name: string
  mcVersion: string
  loader: Loader
  loaderVersion: string | null
  /** Java major version the server needs (8, 17, 21, 25...). */
  javaMajor: number
  /** Custom java executable; null means the app manages Java. */
  javaPath: string | null
  memoryMb: number
  port: number
  /** JVM flags, visible and editable in Advanced. */
  jvmArgs: string[]
  launch: LaunchSpec | null
  /** False until the install task finishes successfully. */
  installed: boolean
  createdAt: string
  lastStartedAt: string | null
  /** Who can join and how. Missing in configs from before networking existed. */
  network?: ServerNetworkConfig
  /** When this server backs itself up. Missing = the defaults. */
  backups?: BackupSchedule
}

export type ServerStatus = 'installing' | 'stopped' | 'starting' | 'running' | 'stopping' | 'crashed'

export interface ServerSummary {
  config: ServerConfig
  status: ServerStatus
  /** Plain-English reason when the server crashed or failed to install. */
  problem: string | null
  players: string[]
  maxPlayers: number | null
  /** Settings changed while running; a restart applies them. */
  restartNeeded: boolean
  /** The background task currently working on this server (e.g. setup), if any. */
  taskId: string | null
}

export interface CreateServerRequest {
  name: string
  mcVersion: string
  loader: Exclude<Loader, 'custom'>
  /** null picks the recommended or latest stable build. */
  loaderVersion: string | null
  memoryMb: number
  /** null picks the first free port from 25565. */
  port: number | null
  acceptEula: boolean
  gamemode: Gamemode
  difficulty: Difficulty
  /** Empty for a random world. */
  seed: string
  whitelist: boolean
}

export interface McVersionInfo {
  id: string
  type: 'release' | 'snapshot'
  releaseTime: string
}

export interface LoaderAvailability {
  loader: Exclude<Loader, 'custom'>
  available: boolean
  /** Newest first; the first entry is the default choice. */
  versions: { id: string; label: string }[]
  /** Why it's unavailable, in plain words. */
  reason: string | null
}

export interface MemoryInfo {
  totalMb: number
  /** Most the app will allow, leaving room for the PC. */
  maxMb: number
  recommendedVanillaMb: number
  recommendedModdedMb: number
}

export type Gamemode = 'survival' | 'creative' | 'adventure' | 'spectator'
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard'
export type PerformancePreset = 'low' | 'balanced' | 'high'

/**
 * A curated subset of server.properties shown in Simple mode. Every field maps to a real key.
 * `null` means this Minecraft version keeps that setting somewhere else (e.g. a game rule).
 */
export interface SimpleProperties {
  motd: string
  gamemode: Gamemode
  difficulty: Difficulty
  hardcore: boolean
  maxPlayers: number
  pvp: boolean | null
  whitelist: boolean
  allowFlight: boolean
  commandBlocks: boolean | null
  /** 'custom' when the distances were set by hand in Advanced. */
  performance: PerformancePreset | 'custom'
}

export interface ServerPropertiesView {
  simple: SimpleProperties
  /** The whole file as text, for the Advanced editor. */
  raw: string
  /** False before the first start, when the server hasn't written its full file yet. */
  complete: boolean
}

export interface ConsoleLine {
  /** Monotonic per-server counter so the UI can merge batches in order. */
  seq: number
  text: string
  source: 'out' | 'err' | 'app'
}
