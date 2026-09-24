import type {
  Difficulty,
  Gamemode,
  PerformancePreset,
  SimpleProperties
} from '@shared/servers'
import type { PropertiesFile } from './properties'

/** Which server.properties conventions a Minecraft version uses. */
export interface VersionFeatures {
  /** Before 1.14, gamemode/difficulty were written as numbers. */
  numericModes: boolean
  /** simulation-distance exists from 1.18. */
  simulationDistance: boolean
  /** pvp and enable-command-block moved to game rules in 1.21.9. */
  pvpInProperties: boolean
  /** enforce-whitelist exists from 1.13. */
  enforceWhitelist: boolean
}

const GAMEMODES: Gamemode[] = ['survival', 'creative', 'adventure', 'spectator']
const DIFFICULTIES: Difficulty[] = ['peaceful', 'easy', 'normal', 'hard']

const PRESETS: Record<PerformancePreset, { view: number; sim: number }> = {
  low: { view: 6, sim: 5 },
  balanced: { view: 10, sim: 10 },
  high: { view: 16, sim: 12 }
}

function pick<T extends string>(raw: string | undefined, names: T[], fallback: T): T {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (Number.isInteger(n) && names[n]) return names[n]
  return (names as string[]).includes(raw.toLowerCase()) ? (raw.toLowerCase() as T) : fallback
}

const bool = (raw: string | undefined, fallback: boolean): boolean =>
  raw === undefined ? fallback : raw.trim().toLowerCase() === 'true'

/** Writes gamemode/difficulty in whichever style the file (or version) already uses. */
function modeValue(props: PropertiesFile, key: string, index: number, name: string, f: VersionFeatures): string {
  const current = props.get(key)
  const numeric = current !== undefined ? /^\d+$/.test(current.trim()) : f.numericModes
  return numeric ? String(index) : name
}

export function readSimple(props: PropertiesFile, f: VersionFeatures, complete: boolean): SimpleProperties {
  const view = Number(props.get('view-distance') ?? 10)
  const sim = Number(props.get('simulation-distance') ?? 10)
  const preset = (Object.keys(PRESETS) as PerformancePreset[]).find(
    (p) => PRESETS[p].view === view && (!f.simulationDistance || PRESETS[p].sim === sim)
  )
  // Once the server has written its full file, trust what's in it over our version table.
  const pvpHere = complete ? props.has('pvp') : f.pvpInProperties
  const cmdHere = complete ? props.has('enable-command-block') : f.pvpInProperties
  return {
    motd: props.get('motd') ?? 'A Minecraft Server',
    gamemode: pick(props.get('gamemode'), GAMEMODES, 'survival'),
    difficulty: pick(props.get('difficulty'), DIFFICULTIES, 'easy'),
    hardcore: bool(props.get('hardcore'), false),
    maxPlayers: Number(props.get('max-players') ?? 20) || 20,
    pvp: pvpHere ? bool(props.get('pvp'), true) : null,
    whitelist: bool(props.get('white-list'), false),
    allowFlight: bool(props.get('allow-flight'), false),
    commandBlocks: cmdHere ? bool(props.get('enable-command-block'), false) : null,
    performance: preset ?? 'custom'
  }
}

export function applySimple(
  props: PropertiesFile,
  patch: Partial<SimpleProperties>,
  f: VersionFeatures
): void {
  if (patch.motd !== undefined) props.set('motd', patch.motd.slice(0, 120))
  if (patch.gamemode && GAMEMODES.includes(patch.gamemode)) {
    props.set('gamemode', modeValue(props, 'gamemode', GAMEMODES.indexOf(patch.gamemode), patch.gamemode, f))
  }
  if (patch.difficulty && DIFFICULTIES.includes(patch.difficulty)) {
    props.set(
      'difficulty',
      modeValue(props, 'difficulty', DIFFICULTIES.indexOf(patch.difficulty), patch.difficulty, f)
    )
  }
  if (patch.hardcore !== undefined) props.set('hardcore', String(patch.hardcore))
  if (patch.maxPlayers !== undefined) {
    props.set('max-players', String(Math.min(1000, Math.max(1, Math.round(patch.maxPlayers)))))
  }
  if (patch.pvp !== undefined && patch.pvp !== null) props.set('pvp', String(patch.pvp))
  if (patch.whitelist !== undefined) {
    props.set('white-list', String(patch.whitelist))
    if (f.enforceWhitelist) props.set('enforce-whitelist', String(patch.whitelist))
  }
  if (patch.allowFlight !== undefined) props.set('allow-flight', String(patch.allowFlight))
  if (patch.commandBlocks !== undefined && patch.commandBlocks !== null) {
    props.set('enable-command-block', String(patch.commandBlocks))
  }
  if (patch.performance && patch.performance !== 'custom') {
    const p = PRESETS[patch.performance]
    props.set('view-distance', String(p.view))
    if (f.simulationDistance) props.set('simulation-distance', String(p.sim))
  }
}
