import { BrowserWindow, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { IPC, type AppInfo, type FolderKind } from '@shared/ipc'
import type { SettingsStore } from './settings'
import type { TaskManager } from './tasks'
import { openExternalSafe } from './external'
import { isTrustedUrl } from './window'
import { logger } from './log'

const log = logger('ipc')

interface Deps {
  settings: SettingsStore
  tasks: TaskManager
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

export function registerIpc({ settings, tasks, appInfo }: Deps): void {
  handle(IPC.appInfo, () => appInfo())
  handle(IPC.appOpenFolder, async (which) => {
    if (!FOLDERS.includes(which as FolderKind)) return
    const error = await shell.openPath(appInfo().paths[which as FolderKind])
    if (error) log.warn(`could not open folder ${which}: ${error}`)
  })
  handle(IPC.appOpenExternal, (url) => openExternalSafe(String(url)))

  handle(IPC.settingsGet, () => settings.get())
  handle(IPC.settingsUpdate, (patch) => settings.update(patch))
  settings.on('change', (next) => broadcast(IPC.settingsChanged, next))

  handle(IPC.tasksList, () => tasks.list())
  handle(IPC.tasksCancel, (id) => tasks.cancel(String(id)))
  handle(IPC.tasksDismiss, (id) => tasks.dismiss(String(id)))
  tasks.on('update', (snap) => broadcast(IPC.tasksUpdated, snap))
  tasks.on('remove', (id) => broadcast(IPC.tasksRemoved, id))
}
