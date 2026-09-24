import { gunzipSync } from 'node:zlib'
import { deserialize } from '@xmcl/nbt'

export interface LevelDat {
  levelName: string
  /** e.g. "26.2"; null for worlds older than 1.9, which don't record it. */
  versionName: string | null
  dataVersion: number | null
  brands: string[]
  wasModded: boolean
  /** Forge worlds record their mod list here. */
  forgeMods: string[]
}

interface Raw {
  Data?: {
    LevelName?: string
    Version?: { Name?: string; Id?: number }
    DataVersion?: number
    ServerBrands?: string[]
    WasModded?: number | boolean
    FML?: { ModList?: { ModId?: string }[] }
  }
  fml?: { LoadingModList?: { ModId?: string }[] }
  FML?: { ModList?: { ModId?: string }[] }
}

/** Reads level.dat (gzip NBT) for name, version, and what it was last played with. */
export async function readLevelDat(data: Uint8Array): Promise<LevelDat> {
  const plain = data[0] === 0x1f && data[1] === 0x8b ? gunzipSync(data) : data
  const raw = await deserialize<Raw>(plain)
  const d = raw.Data ?? {}
  const fml = raw.fml?.LoadingModList ?? raw.FML?.ModList ?? d.FML?.ModList ?? []
  return {
    levelName: d.LevelName ?? 'World',
    versionName: d.Version?.Name ?? null,
    dataVersion: d.DataVersion ?? d.Version?.Id ?? null,
    brands: Array.isArray(d.ServerBrands) ? d.ServerBrands.map(String) : [],
    wasModded: d.WasModded === 1 || d.WasModded === true,
    forgeMods: fml.map((m) => m.ModId ?? '').filter(Boolean)
  }
}

/** Maps a server brand recorded in a world to the server type that should run it. */
export function loaderFromBrands(brands: string[]): 'vanilla' | 'paper' | 'fabric' | 'forge' | 'neoforge' | 'quilt' | null {
  const last = brands.map((b) => b.toLowerCase()).reverse()
  for (const b of last) {
    if (b.includes('neoforge')) return 'neoforge'
    if (b.includes('forge') || b === 'fml') return 'forge'
    if (b.includes('quilt')) return 'quilt'
    if (b.includes('fabric')) return 'fabric'
    if (b.includes('paper') || b.includes('purpur') || b.includes('spigot') || b.includes('bukkit')) return 'paper'
    if (b === 'vanilla') return 'vanilla'
  }
  return null
}
