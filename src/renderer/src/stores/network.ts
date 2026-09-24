import { create } from 'zustand'
import type { ServerNetworkView } from '@shared/network'
import { api } from '@/lib/api'

interface NetworkState {
  views: Record<string, ServerNetworkView>
  load(id: string, refreshFirewall?: boolean): Promise<void>
}

export const useNetwork = create<NetworkState>((set) => ({
  views: {},
  load: async (id, refreshFirewall = false) => {
    const view = await api.network.view(id, refreshFirewall)
    set((s) => ({ views: { ...s.views, [id]: view } }))
  }
}))

api.network.onChanged(({ id, view }) =>
  useNetwork.setState((s) => ({ views: { ...s.views, [id]: view } }))
)
