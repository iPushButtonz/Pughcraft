export type IpClass = 'loopback' | 'private' | 'cgnat' | 'link-local' | 'public' | 'invalid'

function octets(ip: string): number[] | null {
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return null
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null
}

/** What kind of IPv4 address this is, for telling CGNAT and double NAT apart. */
export function classifyIpv4(ip: string): IpClass {
  const o = octets(ip)
  if (!o) return 'invalid'
  const [a, b] = o
  if (a === 127) return 'loopback'
  if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private'
  // 100.64.0.0/10: shared address space ISPs use for carrier-grade NAT.
  if (a === 100 && b >= 64 && b <= 127) return 'cgnat'
  if (a === 169 && b === 254) return 'link-local'
  if (a === 0 || a >= 224) return 'invalid'
  return 'public'
}

/** "host" for the default Minecraft port, "host:port" otherwise. */
export function joinAddress(host: string, port: number): string {
  return port === 25565 ? host : `${host}:${port}`
}
