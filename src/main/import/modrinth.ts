import type { ModSide } from '@shared/imports'
import { userAgent } from '../core/http'
import { logger } from '../log'

const log = logger('modrinth')
const API = 'https://api.modrinth.com/v2'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`Modrinth answered ${res.status}`)
  return (await res.json()) as T
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { 'User-Agent': userAgent() },
    signal: AbortSignal.timeout(20_000)
  })
  if (!res.ok) throw new Error(`Modrinth answered ${res.status}`)
  return (await res.json()) as T
}

type SideReq = 'required' | 'optional' | 'unsupported' | 'unknown'

function toSide(client: SideReq, server: SideReq): ModSide {
  if (server === 'unsupported' && client !== 'unsupported') return 'client'
  if (client === 'unsupported' && server !== 'unsupported') return 'server'
  if (client === 'unknown' || server === 'unknown') return 'unknown'
  return 'both'
}

/**
 * Looks mods up on Modrinth by file hash and returns which side each runs on.
 * Files Modrinth doesn't know are simply missing from the result. Never throws.
 */
export async function lookupSides(sha1s: string[]): Promise<Map<string, ModSide>> {
  const out = new Map<string, ModSide>()
  const unique = [...new Set(sha1s)]
  try {
    for (let i = 0; i < unique.length; i += 200) {
      const batch = unique.slice(i, i + 200)
      const versions = await post<Record<string, { project_id: string }>>('/version_files', {
        hashes: batch,
        algorithm: 'sha1'
      })
      const projectIds = [...new Set(Object.values(versions).map((v) => v.project_id))]
      const sidesByProject = new Map<string, ModSide>()
      for (let j = 0; j < projectIds.length; j += 100) {
        const ids = encodeURIComponent(JSON.stringify(projectIds.slice(j, j + 100)))
        const projects = await get<{ id: string; client_side: SideReq; server_side: SideReq }[]>(
          `/projects?ids=${ids}`
        )
        for (const p of projects) sidesByProject.set(p.id, toSide(p.client_side, p.server_side))
      }
      for (const [sha1, v] of Object.entries(versions)) {
        const side = sidesByProject.get(v.project_id)
        if (side) out.set(sha1, side)
      }
    }
  } catch (err) {
    // Offline or Modrinth down: fall back to the other checks.
    log.warn('Modrinth side lookup failed', err)
  }
  return out
}
