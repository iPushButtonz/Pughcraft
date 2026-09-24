import type { Settings, SettingsPatch } from './settings'
import type { TaskSnapshot } from './tasks'
import type {
  ConsoleLine,
  CreateServerRequest,
  LoaderAvailability,
  McVersionInfo,
  MemoryInfo,
  ServerPropertiesView,
  ServerSummary,
  SimpleProperties
} from './servers'

export type FolderKind = 'library' | 'dataRoot' | 'logs'

export interface AppInfo {
  name: string
  version: string
  platform: string
  versions: { electron: string; chrome: string; node: string }
  paths: Record<FolderKind, string>
}

export interface ServerConfigPatch {
  name?: string
  memoryMb?: number
  jvmArgs?: string[]
  port?: number
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
  catalog: {
    mcVersions(): Promise<{ versions: McVersionInfo[]; latest: string }>
    loaders(mcVersion: string): Promise<LoaderAvailability[]>
    memory(): Promise<MemoryInfo>
  }
  servers: {
    list(): Promise<ServerSummary[]>
    create(request: CreateServerRequest): Promise<{ id: string; taskId: string }>
    retryInstall(id: string): Promise<string>
    start(id: string): Promise<void>
    stop(id: string): Promise<void>
    restart(id: string): Promise<void>
    kill(id: string): Promise<void>
    command(id: string, text: string): Promise<void>
    console(id: string): Promise<ConsoleLine[]>
    properties(id: string): Promise<ServerPropertiesView>
    setSimple(id: string, patch: Partial<SimpleProperties>): Promise<ServerPropertiesView>
    setRaw(id: string, text: string): Promise<ServerPropertiesView>
    update(id: string, patch: ServerConfigPatch): Promise<ServerSummary>
    remove(id: string): Promise<void>
    openFolder(id: string): Promise<void>
    onChanged(listener: (server: ServerSummary) => void): () => void
    onRemoved(listener: (id: string) => void): () => void
    onConsole(listener: (batch: { id: string; lines: ConsoleLine[] }) => void): () => void
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
  tasksRemoved: 'tasks:removed',
  catalogMcVersions: 'catalog:mc-versions',
  catalogLoaders: 'catalog:loaders',
  catalogMemory: 'catalog:memory',
  serversList: 'servers:list',
  serversCreate: 'servers:create',
  serversRetryInstall: 'servers:retry-install',
  serversStart: 'servers:start',
  serversStop: 'servers:stop',
  serversRestart: 'servers:restart',
  serversKill: 'servers:kill',
  serversCommand: 'servers:command',
  serversConsole: 'servers:console',
  serversProperties: 'servers:properties',
  serversSetSimple: 'servers:set-simple',
  serversSetRaw: 'servers:set-raw',
  serversUpdate: 'servers:update',
  serversRemove: 'servers:remove',
  serversOpenFolder: 'servers:open-folder',
  serversChanged: 'servers:changed',
  serversRemoved: 'servers:removed',
  serversConsoleLines: 'servers:console-lines'
} as const
