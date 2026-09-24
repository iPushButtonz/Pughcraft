import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { IPC, type AppInfo, type FolderKind, type ServerConfigPatch } from '@shared/ipc'
import type { CreateServerRequest, SimpleProperties } from '@shared/servers'
import type { SettingsStore } from './settings'
import type { TaskManager } from './tasks'
import type { ServerManager } from './servers/manager'
import type { MojangMeta } from './core/mojang'
import { loaderAvailability } from './servers/catalog'
import { memoryInfo } from './servers/system'
import { openExternalSafe } from './external'
import { isTrustedUrl } from './window'
import { logger } from './log'

const log = logger('ipc')

interface Deps {
  settings: SettingsStore
  tasks: TaskManager
  servers: ServerManager
  mojang: MojangMeta
  appInfo: () => AppInfo
}

type Handler = (...args: unknown[]) => unknown

/** Registers a request handler that only answers our own UI. */
function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedUrl(event.senderFrame?.url)) {
      log.warn(`blocked ${channel} from untrusted frame ${event.senderFrame?.url}`)
      throw new Error('Untrusted sender')
    }
    return fn(...args)
  })
}

/** Sends an event to every open window of ours. */
function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

const FOLDERS: FolderKind[] = ['library', 'dataRoot', 'logs']
const str = (v: unknown): string => String(v)

export function registerIpc({ settings, tasks, servers, mojang, appInfo }: Deps): void {
  handle(IPC.appInfo, () => appInfo())
  handle(IPC.appOpenFolder, async (which) => {
    if (!FOLDERS.includes(which as FolderKind)) return
    const error = await shell.openPath(appInfo().paths[which as FolderKind])
    if (error) log.warn(`could not open folder ${which}: ${error}`)
  })
  handle(IPC.appOpenExternal, (url) => openExternalSafe(str(url)))

  handle(IPC.settingsGet, () => settings.get())
  handle(IPC.settingsUpdate, (patch) => settings.update(patch))
  settings.on('change', (next) => broadcast(IPC.settingsChanged, next))

  handle(IPC.tasksList, () => tasks.list())
  handle(IPC.tasksCancel, (id) => tasks.cancel(str(id)))
  handle(IPC.tasksDismiss, (id) => tasks.dismiss(str(id)))
  tasks.on('update', (snap) => broadcast(IPC.tasksUpdated, snap))
  tasks.on('remove', (id) => broadcast(IPC.tasksRemoved, id))

  handle(IPC.catalogMcVersions, async () => ({
    versions: await mojang.listVersions(),
    latest: await mojang.latestRelease()
  }))
  handle(IPC.catalogLoaders, (mc) => loaderAvailability(mojang, str(mc)))
  handle(IPC.catalogMemory, () => memoryInfo())

  handle(IPC.serversList, () => servers.list())
  handle(IPC.serversCreate, (req) => servers.create(req as CreateServerRequest))
  handle(IPC.serversRetryInstall, (id) => servers.retryInstall(str(id)))
  handle(IPC.serversStart, (id) => servers.start(str(id)))
  handle(IPC.serversStop, (id) => servers.stop(str(id)))
  handle(IPC.serversRestart, (id) => servers.restart(str(id)))
  handle(IPC.serversKill, (id) => servers.kill(str(id)))
  handle(IPC.serversCommand, (id, text) => servers.command(str(id), str(text)))
  handle(IPC.serversConsole, (id) => servers.consoleBuffer(str(id)))
  handle(IPC.serversProperties, (id) => servers.properties(str(id)))
  handle(IPC.serversSetSimple, (id, patch) =>
    servers.setSimple(str(id), (patch ?? {}) as Partial<SimpleProperties>)
  )
  handle(IPC.serversSetRaw, (id, text) => servers.setRaw(str(id), str(text)))
  handle(IPC.serversUpdate, (id, patch) => servers.update(str(id), (patch ?? {}) as ServerConfigPatch))
  handle(IPC.serversRemove, (id) => servers.remove(str(id)))
  handle(IPC.serversOpenFolder, (id) => servers.openFolder(str(id)))
  servers.on('changed', (summary) => broadcast(IPC.serversChanged, summary))
  servers.on('removed', (id) => broadcast(IPC.serversRemoved, id))
  servers.on('console', (batch) => broadcast(IPC.serversConsoleLines, batch))
}
