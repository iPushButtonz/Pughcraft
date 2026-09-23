import type { Settings, SettingsPatch } from './settings'
import type { TaskSnapshot } from './tasks'

export type FolderKind = 'library' | 'dataRoot' | 'logs'

export interface AppInfo {
  name: string
  version: string
  platform: string
  versions: { electron: string; chrome: string; node: string }
  paths: Record<FolderKind, string>
}

/** The API the preload script exposes to the UI as `window.pughcraft`. */
export interface PughcraftApi {
  app: {
    info(): Promise<AppInfo>
    openFolder(which: FolderKind): Promise<void>
    openExternal(url: string): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    update(patch: SettingsPatch): Promise<Settings>
    onChange(listener: (settings: Settings) => void): () => void
  }
  tasks: {
    list(): Promise<TaskSnapshot[]>
    cancel(id: string): Promise<void>
    dismiss(id: string): Promise<void>
    onUpdate(listener: (task: TaskSnapshot) => void): () => void
    onRemove(listener: (id: string) => void): () => void
  }
}

/** IPC channel names, shared so main and preload can't drift apart. */
export const IPC = {
  appInfo: 'app:info',
  appOpenFolder: 'app:open-folder',
  appOpenExternal: 'app:open-external',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsChanged: 'settings:changed',
  tasksList: 'tasks:list',
  tasksCancel: 'tasks:cancel',
  tasksDismiss: 'tasks:dismiss',
  tasksUpdated: 'tasks:updated',
  tasksRemoved: 'tasks:removed'
} as const
