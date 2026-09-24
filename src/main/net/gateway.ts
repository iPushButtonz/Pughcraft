import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)

/** The router's address on the home network (e.g. 192.168.50.1), or null if unknown. */
export async function defaultGateway(preferInterfaceIp?: string | null): Promise<string | null> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run('route', ['print', '-4', '0.0.0.0'], { windowsHide: true, timeout: 5000 })
      // Lines look like: "0.0.0.0   0.0.0.0   192.168.50.1   192.168.50.154   35"
      const routes = [...stdout.matchAll(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+\.\d+\.\d+\.\d+)\s+(\d+)/gm)]
        .map((m) => ({ gateway: m[1], iface: m[2], metric: Number(m[3]) }))
        .sort((a, b) => a.metric - b.metric)
      return (routes.find((r) => r.iface === preferInterfaceIp) ?? routes[0])?.gateway ?? null
    }
    // Linux: /proc/net/route has the gateway as little-endian hex.
    const table = await readFile('/proc/net/route', 'utf8')
    for (const line of table.split('\n').slice(1)) {
      const [, dest, gw] = line.trim().split(/\s+/)
      if (dest === '00000000' && gw && gw !== '00000000') {
        const n = parseInt(gw, 16)
        return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255].join('.')
      }
    }
  } catch {
    // Fall through: unknown.
  }
  return null
}
