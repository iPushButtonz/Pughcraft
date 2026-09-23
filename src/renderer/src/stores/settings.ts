import { create } from 'zustand'
import type { Settings, SettingsPatch } from '@shared/settings'
import { api } from '@/lib/api'

interface SettingsState {
  settings: Settings | null
  load(): Promise<void>
  update(patch: SettingsPatch): Promise<void>
}

export const useSettings = create<SettingsState>((set) => ({
  settings: null,
  load: async () => set({ settings: await api.settings.get() }),
  update: async (patch) => {
    // Show the change immediately; the saved result replaces it a moment later.
    set((s) => (s.settings ? { settings: { ...s.settings, ...patch } } : s))
    set({ settings: await api.settings.update(patch) })
  }
}))

api.settings.onChange((settings) => useSettings.setState({ settings }))

/** True when the app-wide switch is on Advanced. */
export function useIsAdvanced(): boolean {
  return useSettings((s) => s.settings?.mode === 'advanced')
}
