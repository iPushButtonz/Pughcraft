/** Someone on a server list (whitelist, ops or bans). */
export interface PlayerEntry {
  name: string
  uuid: string | null
  /** Ops: permission level. Bans: the reason. */
  detail: string | null
}

export interface IpBan {
  ip: string
  reason: string | null
}

/** A player the whitelist turned away, so the host can let them in with one click. */
export interface JoinRequest {
  serverId: string
  name: string
  at: string
}

export interface PlayersView {
  running: boolean
  whitelistOn: boolean
  /** online-mode=false: names aren't checked with Mojang. */
  offlineMode: boolean
  online: string[]
  whitelist: PlayerEntry[]
  ops: PlayerEntry[]
  bans: PlayerEntry[]
  ipBans: IpBan[]
  requests: JoinRequest[]
}

export type PlayerAction =
  | 'whitelist-add'
  | 'whitelist-remove'
  | 'op'
  | 'deop'
  | 'ban'
  | 'pardon'
  | 'ban-ip'
  | 'pardon-ip'
  | 'kick'

export interface PlayerActionRequest {
  action: PlayerAction
  /** Player name, or an IP address for ban-ip / pardon-ip. */
  target: string
  reason?: string
}

/** One entry in the Files tab. */
export interface FileEntry {
  name: string
  /** Path relative to the server folder, with "/" separators. */
  path: string
  dir: boolean
  size: number
  modified: string
}

export interface FileContent {
  path: string
  text: string | null
  /** Why the file can't be edited here (binary, too big), or null. */
  reason: string | null
  size: number
}

export interface ServerStats {
  serverId: string
  /** Share of the whole PC's CPU, 0–100. */
  cpuPercent: number
  memoryBytes: number
}
