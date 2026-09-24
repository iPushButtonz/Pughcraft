import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { McVersionInfo } from '@shared/servers'
import { getJson } from './http'
import { logger } from '../log'

const log = logger('mojang')

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const MANIFEST_TTL_MS = 60 * 60 * 1000
/** Oldest version the app supports (SPEC §4.3). */
const OLDEST_SUPPORTED = '1.7.2'

interface ManifestEntry {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  url: string
  releaseTime: string
  sha1: string
}

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: ManifestEntry[]
}

export interface VersionDetails {
  javaMajor: number
  server: { url: string; sha1: string; size: number } | null
}

/** Mojang's version list and per-version data, cached on disk so the app works offline. */
export class MojangMeta {
  private manifest: { data: Manifest; fetchedAt: number } | null = null

  constructor(private readonly cacheDir: string) {}

  async getManifest(signal?: AbortSignal): Promise<Manifest> {
    if (this.manifest && Date.now() - this.manifest.fetchedAt < MANIFEST_TTL_MS) {
      return this.manifest.data
    }
    const file = join(this.cacheDir, 'version_manifest_v2.json')
    try {
      const data = await getJson<Manifest>(MANIFEST_URL, signal)
      await mkdir(this.cacheDir, { recursive: true })
      await writeFile(file, JSON.stringify(data))
      this.manifest = { data, fetchedAt: Date.now() }
      return data
    } catch (err) {
      // Offline: fall back to the last copy we saved.
      try {
        const data = JSON.parse(await readFile(file, 'utf8')) as Manifest
        log.warn('using cached version list (offline?)', err)
        this.manifest = { data, fetchedAt: Date.now() - MANIFEST_TTL_MS + 5 * 60 * 1000 }
        return data
      } catch {
        throw err
      }
    }
  }

  /** Supported versions, newest first. Snapshots only newer than the oldest supported release. */
  async listVersions(signal?: AbortSignal): Promise<McVersionInfo[]> {
    const { versions } = await this.getManifest(signal)
    const oldest = versions.find((v) => v.id === OLDEST_SUPPORTED)
    const cutoff = oldest ? oldest.releaseTime : '2013-10-22'
    return versions
      .filter((v) => (v.type === 'release' || v.type === 'snapshot') && v.releaseTime >= cutoff)
      .map((v) => ({ id: v.id, type: v.type as McVersionInfo['type'], releaseTime: v.releaseTime }))
  }

  async latestRelease(signal?: AbortSignal): Promise<string> {
    return (await this.getManifest(signal)).latest.release
  }

  /** Release date, used to compare versions without parsing their names. */
  async releaseTime(id: string): Promise<string | null> {
    return (await this.getManifest()).versions.find((v) => v.id === id)?.releaseTime ?? null
  }

  async details(id: string, signal?: AbortSignal): Promise<VersionDetails> {
    const entry = (await this.getManifest(signal)).versions.find((v) => v.id === id)
    if (!entry) throw new Error(`Minecraft ${id} isn't a known version.`)
    // Version files never change, so the sha1 names a permanent cache entry.
    const file = join(this.cacheDir, 'versions', `${entry.sha1}.json`)
    let json: {
      javaVersion?: { majorVersion: number }
      downloads?: { server?: { url: string; sha1: string; size: number } }
    }
    try {
      json = JSON.parse(await readFile(file, 'utf8'))
    } catch {
      json = await getJson(entry.url, signal)
      await mkdir(join(this.cacheDir, 'versions'), { recursive: true })
      await writeFile(file, JSON.stringify(json))
    }
    return {
      javaMajor: json.javaVersion?.majorVersion ?? 8,
      server: json.downloads?.server ?? null
    }
  }
}

/** True when `a` came out at or after `b`. Unknown versions count as new. */
export async function isAtLeast(meta: MojangMeta, a: string, b: string): Promise<boolean> {
  const [ta, tb] = await Promise.all([meta.releaseTime(a), meta.releaseTime(b)])
  if (!ta || !tb) return true
  return ta >= tb
}
