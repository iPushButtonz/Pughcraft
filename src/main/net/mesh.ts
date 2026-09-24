import { networkInterfaces } from 'node:os'
import type { MeshKind } from '@shared/network'

/**
 * Finds Tailscale / ZeroTier networks on this PC. They can't be set up from inside the app
 * (they need their own accounts), but if one is running we can show the address friends
 * on that private network should use.
 */
export function meshAddresses(): { kind: MeshKind; ip: string }[] {
  const out: { kind: MeshKind; ip: string }[] = []
  for (const [name, list] of Object.entries(networkInterfaces())) {
    const kind: MeshKind | null = /tailscale/i.test(name) ? 'tailscale' : /zerotier|^zt/i.test(name) ? 'zerotier' : null
    if (!kind) continue
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ kind, ip: a.address })
    }
  }
  return out
}
