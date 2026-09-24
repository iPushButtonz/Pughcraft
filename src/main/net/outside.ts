import { getJson, getText } from '../core/http'
import { logger } from '../log'

const log = logger('outside')

/**
 * The only places the Connection Doctor contacts outside the home network, and only
 * after the user opted in. Each sees the user's public IP address.
 */
export const OUTSIDE_SERVICES = ['api.ipify.org', '1.1.1.1 (Cloudflare)', 'api.mcstatus.io'] as const

/** This home's public IPv4 address as the internet sees it. */
export async function lookupPublicIp(): Promise<string | null> {
  try {
    const { ip } = await getJson<{ ip: string }>('https://api.ipify.org?format=json')
    if (ip) return ip
  } catch (err) {
    log.warn('ipify lookup failed', err)
  }
  try {
    const trace = await getText('https://1.1.1.1/cdn-cgi/trace')
    return /^ip=(.+)$/m.exec(trace)?.[1]?.trim() ?? null
  } catch (err) {
    log.warn('cloudflare trace failed', err)
    return null
  }
}

export interface OutsideProbe {
  reachable: boolean
  /** mcstatus.io caches results for about a minute. */
  cachedUntil: string | null
}

/** Asks mcstatus.io to ping the server from the internet. */
export async function probeFromInternet(host: string, port: number): Promise<OutsideProbe | null> {
  try {
    const res = await getJson<{ online: boolean; expires_at?: number }>(
      `https://api.mcstatus.io/v2/status/java/${encodeURIComponent(`${host}:${port}`)}`
    )
    return {
      reachable: res.online === true,
      cachedUntil: res.expires_at ? new Date(res.expires_at).toISOString() : null
    }
  } catch (err) {
    log.warn('mcstatus probe failed', err)
    return null
  }
}
