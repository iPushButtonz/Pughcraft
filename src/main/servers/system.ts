import { createServer } from 'node:net'
import { totalmem } from 'node:os'
import type { MemoryInfo } from '@shared/servers'

const MB = 1024 * 1024
/** Always leave this much for Windows/Linux and the player's own game. */
const RESERVED_MB = 4096

export function memoryInfo(): MemoryInfo {
  const totalMb = Math.floor(totalmem() / MB)
  const maxMb = Math.max(1024, Math.floor((totalMb - RESERVED_MB) / 512) * 512)
  return {
    totalMb,
    maxMb,
    recommendedVanillaMb: Math.min(3072, maxMb),
    recommendedModdedMb: Math.min(4096, maxMb)
  }
}

/** True when nothing on this PC is listening on `port`. */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(port, '0.0.0.0')
  })
}

/** First free port from 25565 that no other server of ours is set to use. */
export async function pickPort(taken: Set<number>, start = 25565): Promise<number> {
  for (let port = start; port < start + 200; port++) {
    if (!taken.has(port) && (await isPortFree(port))) return port
  }
  throw new Error('Could not find a free network port for the server.')
}
