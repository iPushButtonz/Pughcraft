/** Who a server is meant for. 'unset' until the owner answers the first-start question. */
export type Audience = 'unset' | 'self' | 'lan' | 'internet'

/** How friends outside the home network reach the server. */
export type InternetMethod = 'direct' | 'playit' | 'bore' | 'custom'

export interface ServerNetworkConfig {
  audience: Audience
  method: InternetMethod
  /** Let the app ask the router to forward the port (UPnP / NAT-PMP). */
  autoForward: boolean
}

export const DEFAULT_NETWORK: ServerNetworkConfig = {
  audience: 'unset',
  method: 'direct',
  autoForward: true
}

export type InternetState =
  | 'off' // audience isn't 'internet'
  | 'waiting' // server not running yet
  | 'working' // talking to the router / tunnel
  | 'ready' // friends anywhere can join at `address`
  | 'needs-help' // automatic setup impossible; see `problem`

export type InternetProblem =
  | 'no-router-support' // UPnP / NAT-PMP off or blocked
  | 'cgnat' // ISP shares one address between homes
  | 'double-nat' // a second router sits in front
  | 'port-taken' // the router already forwards this port to another device
  | 'router-refused'
  | 'vpn' // a VPN carries all traffic

export interface FirewallView {
  state: 'ok' | 'blocked' | 'not-allowed' | 'off' | 'unknown'
  networkCategory: 'Public' | 'Private' | 'DomainAuthenticated' | null
  routerRepliesAllowed: boolean
  detail: string
}

export interface ServerNetworkView {
  config: ServerNetworkConfig
  addresses: {
    thisPc: string
    lan: string | null
    internet: string | null
  }
  vpnActive: string | null
  firewall: FirewallView | null
  internet: {
    state: InternetState
    problem: InternetProblem | null
    /** One plain-English sentence about the current state. */
    message: string
    via: 'upnp' | 'natpmp' | null
    router: { manufacturer: string | null; model: string | null } | null
  }
}

export type DoctorCheckStatus = 'pass' | 'fail' | 'warn' | 'skip'

export interface DoctorCheck {
  id: string
  label: string
  status: DoctorCheckStatus
  detail: string
}

export type DoctorFix = 'start-server' | 'firewall' | 'retry-router' | 'tunnel' | 'guide' | 'vpn' | 'choose-audience'

export interface DoctorReport {
  verdict: {
    level: 'ok' | 'problem' | 'warning'
    title: string
    body: string
    fix: DoctorFix | null
  }
  checks: DoctorCheck[]
  /** True when the check from outside the home network was run. */
  usedOutsideServices: boolean
  finishedAt: string
}

export type OutsideChecks = 'ask' | 'on-demand' | 'never'
