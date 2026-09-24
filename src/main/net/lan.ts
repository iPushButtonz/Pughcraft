import { createSocket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import { classifyIpv4 } from './ipclass'

/** Adapter names that belong to VPNs, VMs and other virtual networks, not the home network. */
const VIRTUAL = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|docker|br-|virbr|Loopback|Bluetooth|TAP|TUN|Wintun|WireGuard|NordLynx|Proton|OpenVPN|Tailscale|ZeroTier|Hamachi|Radmin|utun/i

export interface LanInterface {
  name: string
  address: string
  virtual: boolean
}

export function lanInterfaces(): LanInterface[] {
  const out: LanInterface[] = []
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue
      if (classifyIpv4(a.address) === 'link-local') continue
      out.push({ name, address: a.address, virtual: VIRTUAL.test(name) })
    }
  }
  return out
}

/** The local address the OS would use to reach the internet (no packets are sent). */
function defaultRouteAddress(): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = createSocket('udp4')
    const done = (value: string | null): void => {
      socket.close()
      resolve(value)
    }
    socket.on('error', () => done(null))
    socket.connect(53, '8.8.8.8', () => {
      try {
        done(socket.address().address)
      } catch {
        done(null)
      }
    })
  })
}

export interface LanInfo {
  /** The address friends on the same Wi-Fi use, or null when not on a home network. */
  address: string | null
  interfaceName: string | null
  /** A VPN or virtual adapter currently carries the internet traffic. */
  vpnActive: string | null
}

export async function lanInfo(): Promise<LanInfo> {
  const all = lanInterfaces()
  const routed = await defaultRouteAddress()
  const routedIf = all.find((i) => i.address === routed)
  const vpnActive = routedIf?.virtual ? routedIf.name : null
  // Prefer the adapter carrying internet traffic, unless it's a VPN; then the first real private one.
  const pick =
    (routedIf && !routedIf.virtual && routedIf) ||
    all.find((i) => !i.virtual && classifyIpv4(i.address) === 'private') ||
    null
  return { address: pick?.address ?? null, interfaceName: pick?.name ?? null, vpnActive }
}
