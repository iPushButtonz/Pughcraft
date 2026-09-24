import { createSocket } from 'node:dgram'
import { logger } from '../log'

const log = logger('upnp')

/**
 * A small UPnP Internet Gateway Device client: find the router, read its public
 * address, and add/remove/read port forwards. Talks only to devices on the home network.
 */

export interface IgdService {
  controlUrl: string
  serviceType: string
  router: { manufacturer: string | null; model: string | null; name: string | null }
}

export class UpnpError extends Error {
  constructor(
    message: string,
    readonly code: number | null
  ) {
    super(message)
    this.name = 'UpnpError'
  }
}

const SEARCH_TARGETS = [
  'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
  'urn:schemas-upnp-org:device:InternetGatewayDevice:2',
  'urn:schemas-upnp-org:service:WANIPConnection:1'
]

function tag(xml: string, name: string): string | null {
  const m = new RegExp(`<(?:\\w+:)?${name}>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`, 'i').exec(xml)
  return m ? m[1] : null
}

/** Finds the WAN connection service inside a device description document. */
export function parseDescription(xml: string, location: string): IgdService | null {
  const base = tag(xml, 'URLBase') || location
  for (const block of xml.match(/<service>[\s\S]*?<\/service>/gi) ?? []) {
    const type = tag(block, 'serviceType')
    const control = tag(block, 'controlURL')
    if (!type || !control) continue
    if (!/WAN(IP|PPP)Connection:\d/.test(type)) continue
    return {
      serviceType: type,
      controlUrl: new URL(control, base).toString(),
      router: {
        manufacturer: tag(xml, 'manufacturer'),
        model: tag(xml, 'modelName'),
        name: tag(xml, 'friendlyName')
      }
    }
  }
  return null
}

/** Sends SSDP searches from `localAddress` and returns the router's description URLs. */
function ssdpSearch(localAddress: string | null, timeoutMs: number): Promise<string[]> {
  return new Promise((resolve) => {
    const socket = createSocket({ type: 'udp4', reuseAddr: true })
    const locations = new Set<string>()
    const finish = (): void => {
      try {
        socket.close()
      } catch {
        // already closed
      }
      resolve([...locations])
    }
    socket.on('message', (msg) => {
      const m = /^location:\s*(.+)$/im.exec(msg.toString())
      if (m) locations.add(m[1].trim())
    })
    socket.on('error', finish)
    socket.bind(0, localAddress ?? undefined, () => {
      for (const st of SEARCH_TARGETS) {
        const req = [
          'M-SEARCH * HTTP/1.1',
          'HOST: 239.255.255.250:1900',
          'MAN: "ssdp:discover"',
          'MX: 2',
          `ST: ${st}`,
          '',
          ''
        ].join('\r\n')
        socket.send(req, 1900, '239.255.255.250')
      }
    })
    setTimeout(finish, timeoutMs)
  })
}

export async function discoverIgd(localAddress: string | null, timeoutMs = 3000): Promise<IgdService | null> {
  const locations = await ssdpSearch(localAddress, timeoutMs)
  for (const location of locations) {
    try {
      const res = await fetch(location, { signal: AbortSignal.timeout(4000) })
      const svc = parseDescription(await res.text(), location)
      if (svc) return svc
    } catch (err) {
      log.warn(`could not read router description at ${location}`, err)
    }
  }
  return null
}

async function soap(svc: IgdService, action: string, args: Record<string, string | number>): Promise<string> {
  const body =
    '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
    `<s:Body><u:${action} xmlns:u="${svc.serviceType}">` +
    Object.entries(args)
      .map(([k, v]) => `<${k}>${String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</${k}>`)
      .join('') +
    `</u:${action}></s:Body></s:Envelope>`
  const res = await fetch(svc.controlUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      SOAPAction: `"${svc.serviceType}#${action}"`
    },
    body,
    signal: AbortSignal.timeout(6000)
  })
  const text = await res.text()
  if (!res.ok) {
    const code = Number(tag(text, 'errorCode')) || null
    const desc = tag(text, 'errorDescription') ?? `HTTP ${res.status}`
    throw new UpnpError(`${action} refused by the router: ${desc}`, code)
  }
  return text
}

export async function externalIp(svc: IgdService): Promise<string | null> {
  const xml = await soap(svc, 'GetExternalIPAddress', {})
  return tag(xml, 'NewExternalIPAddress') || null
}

export interface Mapping {
  internalClient: string
  internalPort: number
  enabled: boolean
  description: string
  leaseSeconds: number
}

export async function getMapping(svc: IgdService, port: number): Promise<Mapping | null> {
  try {
    const xml = await soap(svc, 'GetSpecificPortMappingEntry', {
      NewRemoteHost: '',
      NewExternalPort: port,
      NewProtocol: 'TCP'
    })
    return {
      internalClient: tag(xml, 'NewInternalClient') ?? '',
      internalPort: Number(tag(xml, 'NewInternalPort')),
      enabled: tag(xml, 'NewEnabled') === '1',
      description: tag(xml, 'NewPortMappingDescription') ?? '',
      leaseSeconds: Number(tag(xml, 'NewLeaseDuration') ?? 0)
    }
  } catch (err) {
    // 714 NoSuchEntryInArray: nothing forwarded on that port.
    if (err instanceof UpnpError && (err.code === 714 || err.code === 402)) return null
    throw err
  }
}

export async function addMapping(
  svc: IgdService,
  opts: { port: number; internalClient: string; description: string; leaseSeconds: number }
): Promise<void> {
  const args = (lease: number): Record<string, string | number> => ({
    NewRemoteHost: '',
    NewExternalPort: opts.port,
    NewProtocol: 'TCP',
    NewInternalPort: opts.port,
    NewInternalClient: opts.internalClient,
    NewEnabled: 1,
    NewPortMappingDescription: opts.description,
    NewLeaseDuration: lease
  })
  try {
    await soap(svc, 'AddPortMapping', args(opts.leaseSeconds))
  } catch (err) {
    // 725 OnlyPermanentLeasesSupported: older routers only take lease 0.
    if (err instanceof UpnpError && err.code === 725) await soap(svc, 'AddPortMapping', args(0))
    else throw err
  }
}

export async function deleteMapping(svc: IgdService, port: number): Promise<void> {
  await soap(svc, 'DeletePortMapping', { NewRemoteHost: '', NewExternalPort: port, NewProtocol: 'TCP' })
}
