import { shell } from 'electron'
import { logger } from './log'

const log = logger('external')

/** Sites the app may open in the user's browser. Anything else is refused. */
const ALLOWED_HOSTS = new Set([
  'github.com',
  'www.minecraft.net',
  'aka.ms',
  'adoptium.net',
  'modrinth.com',
  'www.curseforge.com',
  'hangar.papermc.io',
  'playit.gg',
  'tailscale.com',
  'www.zerotier.com',
  'mcstatus.io',
  'signpath.org'
])

export function isAllowedExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}

export async function openExternalSafe(raw: string): Promise<void> {
  if (!isAllowedExternalUrl(raw)) {
    log.warn(`refused to open ${raw}`)
    return
  }
  await shell.openExternal(raw)
}
