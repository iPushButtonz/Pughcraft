import { create } from 'zustand'

export type Page = 'servers' | 'server' | 'settings'

interface NavState {
  page: Page
  /** The server whose dashboard is open when `page` is 'server'. */
  serverId: string | null
  go(page: Exclude<Page, 'server'>): void
  openServer(id: string): void
}

export const useNav = create<NavState>((set) => ({
  page: 'servers',
  serverId: null,
  go: (page) => set({ page, serverId: null }),
  openServer: (id) => set({ page: 'server', serverId: id })
}))
