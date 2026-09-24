/** Who a server is meant for. 'unset' until the owner answers the first-start question. */
export type Audience = 'unset' | 'self' | 'lan' | 'internet'

/**
 * How friends outside the home network reach the server:
 * direct = the app asks the router (UPnP/NAT-PMP); manual = the user set up port forwarding;
 * playit = built-in tunnel; bore / custom = Advanced tunnels.
 */
export type InternetMethod = 'direct' | 'manual' | 'playit' | 'bore' | 'custom'

export interface ServerNetworkConfig {
  audience: Audience
  method: InternetMethod
  /** Let the app ask the router to forward the port (UPnP / NAT-PMP). */
  autoForward: boolean
  /** The playit.gg tunnel created for this server, reused so its address never changes. */
  playitTunnelId: string | null
  /** Advanced: bore relay host (default bore.pub, or the user's own bore server). */
  boreRelay: string
  /** Advanced: a command that opens your own tunnel ({port} is replaced), and the address it gives. */
  customCommand: string
  customAddress: string
}

export const DEFAULT_NETWORK: ServerNetworkConfig = {
  audience: 'unset',
  method: 'direct',
  autoForward: true,
  playitTunnelId: null,
  boreRelay: 'bore.pub',
  customCommand: '',
  customAddress: ''
}

export type RouterBrand =
  | 'asus'
  | 'tplink'
  | 'netgear'
  | 'linksys'
  | 'xfinity'
  | 'att'
  | 'verizon'
  | 'spectrum'
  | 'mikrotik'
  | 'ubiquiti'
  | 'fritzbox'
  | 'dlink'
  | 'eero'
  | 'other'

export type MeshKind = 'tailscale' | 'zerotier'

export interface PlayitStatus {
  supported: boolean
  linked: boolean
  agentRunning: boolean
  accountStatus: string | null
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
  | 'tunnel-failed' // a tunnel (playit, bore, custom) couldn't start
  | 'need-public-ip' // manual forwarding, but looking up the public address isn't allowed

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
    via: 'upnp' | 'natpmp' | 'manual' | 'playit' | 'bore' | 'custom' | null
    router: { manufacturer: string | null; model: string | null } | null
  }
  /** For the port-forward guide. */
  router: { gateway: string | null; brand: RouterBrand | null }
  /** This PC's address on the home network (without port), for the port-forward guide. */
  lanIp: string | null
  port: number
  /** Tailscale / ZeroTier addresses friends on those private networks can use. */
  mesh: { kind: MeshKind; address: string }[]
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
