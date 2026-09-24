import type { RouterBrand } from '@shared/network'

/** Words routers put in their login page, mapped to the brand guide to show. */
const SIGNATURES: [RegExp, RouterBrand][] = [
  [/ASUS|ASUSWRT|RT-AX|RT-AC|ZenWiFi/i, 'asus'],
  [/TP-?LINK|Archer|Deco/i, 'tplink'],
  [/NETGEAR|Nighthawk|Orbi/i, 'netgear'],
  [/Linksys|Smart Wi-?Fi|Velop/i, 'linksys'],
  [/Xfinity|Comcast/i, 'xfinity'],
  [/AT&amp;T|AT&T|BGW\d{3}|Pace/i, 'att'],
  [/Verizon|Fios/i, 'verizon'],
  [/Spectrum|Charter/i, 'spectrum'],
  [/RouterOS|MikroTik/i, 'mikrotik'],
  [/UniFi|Ubiquiti|EdgeOS|EdgeRouter/i, 'ubiquiti'],
  [/FRITZ!?Box/i, 'fritzbox'],
  [/D-?LINK/i, 'dlink'],
  [/eero/i, 'eero']
]

export function brandFromText(text: string): RouterBrand | null {
  for (const [re, brand] of SIGNATURES) if (re.test(text)) return brand
  return null
}

/**
 * Guesses the router brand from its own login page (read-only; nothing is logged into
 * or changed), so the port-forward guide can say where the setting lives.
 */
export async function detectRouterBrand(gateway: string): Promise<RouterBrand | null> {
  for (const scheme of ['http', 'https']) {
    try {
      const res = await fetch(`${scheme}://${gateway}/`, { signal: AbortSignal.timeout(3000), redirect: 'follow' })
      const text = (await res.text()).slice(0, 20_000)
      const title = /<title>([^<]*)<\/title>/i.exec(text)?.[1] ?? ''
      const brand =
        brandFromText(`${title} ${res.headers.get('server') ?? ''} ${res.headers.get('www-authenticate') ?? ''}`) ??
        brandFromText(text)
      return brand ?? 'other'
    } catch {
      // Try the next scheme.
    }
  }
  return null
}
