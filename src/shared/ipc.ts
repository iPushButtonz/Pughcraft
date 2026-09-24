import type { Settings, SettingsPatch } from './settings'
import type { Audience, DoctorReport, PlayitStatus, ServerNetworkView } from './network'
import type { FoundItem, ImportAnalysis, ImportRequest, WorldInfo } from './imports'
import type { TaskSnapshot } from './tasks'
import type { BackupSchedule, BackupsView, RestoreMode } from './backups'
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
  network: {
    view(id: string, refreshFirewall?: boolean): Promise<ServerNetworkView>
    setAudience(id: string, audience: Exclude<Audience, 'unset'>): Promise<ServerNetworkView>
    retry(id: string): Promise<void>
    fixFirewall(): Promise<'fixed' | 'cancelled' | 'failed'>
    doctor(id: string): Promise<DoctorReport>
    /** Starts the one-click tunnel setup; returns the task id to follow. */
    useTunnel(id: string): Promise<string>
    useDirect(id: string): Promise<void>
    playitStatus(): Promise<PlayitStatus>
    unlinkPlayit(): Promise<void>
    /** Manual forwarding, bore or a custom tunnel. Returns a task id when something downloads. */
    setMethod(
      id: string,
      method: 'direct' | 'manual' | 'bore' | 'custom',
      extra?: { boreRelay?: string; customCommand?: string; customAddress?: string }
    ): Promise<string | null>
    /** Opens the router's own settings page in the browser (home network address only). */
    openRouterPage(id: string): Promise<void>
    onChanged(listener: (update: { id: string; view: ServerNetworkView }) => void): () => void
  }
  imports: {
    /** Worlds and modded instances found in launchers installed on this PC (read-only). */
    scan(): Promise<FoundItem[]>
    pick(kind: 'file' | 'folder'): Promise<string | null>
    /** The real path of a file dropped onto the window. */
    pathForFile(file: File): string
    analyze(path: string): Promise<ImportAnalysis>
    run(request: ImportRequest): Promise<{ serverId: string; taskId: string }>
    discard(analysisId: string): Promise<void>
  }
  worlds: {
    list(serverId: string): Promise<WorldInfo[]>
    activate(serverId: string, slot: string): Promise<void>
    remove(serverId: string, slot: string): Promise<void>
    onChanged(listener: (serverId: string) => void): () => void
  }
  backups: {
    view(serverId: string): Promise<BackupsView>
    /** Returns the task id to follow. */
    backupNow(serverId: string): Promise<string>
    /** Returns a task id when the backups have to move to a new folder. */
    setSchedule(serverId: string, patch: Partial<BackupSchedule>): Promise<string | null>
    setProtected(serverId: string, backupId: string, value: boolean): Promise<void>
    delete(serverId: string, backupId: string): Promise<void>
    restore(serverId: string, backupId: string, mode: RestoreMode): Promise<string>
    /** Asks where to save; null when the user cancels. */
    exportZip(serverId: string, backupId: string): Promise<string | null>
    pickLocation(): Promise<string | null>
    openFolder(serverId: string): Promise<void>
    onChanged(listener: (serverId: string) => void): () => void
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
  serversConsoleLines: 'servers:console-lines',
  networkView: 'network:view',
  networkSetAudience: 'network:set-audience',
  networkRetry: 'network:retry',
  networkFixFirewall: 'network:fix-firewall',
  networkDoctor: 'network:doctor',
  networkUseTunnel: 'network:use-tunnel',
  networkUseDirect: 'network:use-direct',
  networkPlayitStatus: 'network:playit-status',
  networkUnlinkPlayit: 'network:unlink-playit',
  networkSetMethod: 'network:set-method',
  networkOpenRouterPage: 'network:open-router-page',
  networkChanged: 'network:changed',
  importsScan: 'imports:scan',
  importsPick: 'imports:pick',
  importsAnalyze: 'imports:analyze',
  importsRun: 'imports:run',
  importsDiscard: 'imports:discard',
  worldsList: 'worlds:list',
  worldsActivate: 'worlds:activate',
  worldsRemove: 'worlds:remove',
  worldsChanged: 'worlds:changed',
  backupsView: 'backups:view',
  backupsNow: 'backups:now',
  backupsSetSchedule: 'backups:set-schedule',
  backupsSetProtected: 'backups:set-protected',
  backupsDelete: 'backups:delete',
  backupsRestore: 'backups:restore',
  backupsExport: 'backups:export',
  backupsPickLocation: 'backups:pick-location',
  backupsOpenFolder: 'backups:open-folder',
  backupsChanged: 'backups:changed'
} as const
