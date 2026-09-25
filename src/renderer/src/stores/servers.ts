import { create } from 'zustand'
import type { ConsoleLine, ServerSummary } from '@shared/servers'
import type { ServerStats } from '@shared/players'
import { api } from '@/lib/api'

const MAX_LINES = 3000

interface ServersState {
  loaded: boolean
  servers: Record<string, ServerSummary>
  /** Console lines per server, only for servers whose console has been opened. */
  consoles: Record<string, ConsoleLine[]>
  /** Latest CPU/memory reading per running server. */
  stats: Record<string, ServerStats>
  loadConsole(id: string): Promise<void>
}

export const useServers = create<ServersState>((set, get) => ({
  loaded: false,
  servers: {},
  consoles: {},
  stats: {},
  loadConsole: async (id) => {
    if (get().consoles[id]) return
    const lines = await api.servers.console(id)
    set((s) => ({ consoles: { ...s.consoles, [id]: lines.slice(-MAX_LINES) } }))
  }
}))

api.servers.onChanged((server) =>
  useServers.setState((s) => {
    const servers = { ...s.servers, [server.config.id]: server }
    if (server.status === 'running' || !s.stats[server.config.id]) return { servers }
    const { [server.config.id]: _old, ...stats } = s.stats
    return { servers, stats }
  })
)
api.servers.onStats((list) =>
  useServers.setState((s) => ({ stats: { ...s.stats, ...Object.fromEntries(list.map((x) => [x.serverId, x])) } }))
)
api.servers.onRemoved((id) =>
  useServers.setState((s) => {
    const { [id]: _gone, ...servers } = s.servers
    const { [id]: _lines, ...consoles } = s.consoles
    return { servers, consoles }
  })
)
api.servers.onConsole(({ id, lines }) =>
  useServers.setState((s) => {
    const existing = s.consoles[id]
    if (!existing) return s
    const last = existing.at(-1)?.seq ?? 0
    const fresh = lines.filter((l) => l.seq > last)
    if (fresh.length === 0) return s
    return { consoles: { ...s.consoles, [id]: [...existing, ...fresh].slice(-MAX_LINES) } }
  })
)
void api.servers.list().then((list) =>
  useServers.setState({
    loaded: true,
    servers: Object.fromEntries(list.map((s) => [s.config.id, s]))
  })
)

export function useServer(id: string | null): ServerSummary | null {
  return useServers((s) => (id ? (s.servers[id] ?? null) : null))
}
