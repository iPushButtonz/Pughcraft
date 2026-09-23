import { create } from 'zustand'

export type Page = 'servers' | 'settings'

interface NavState {
  page: Page
  go(page: Page): void
}

export const useNav = create<NavState>((set) => ({
  page: 'servers',
  go: (page) => set({ page })
}))
