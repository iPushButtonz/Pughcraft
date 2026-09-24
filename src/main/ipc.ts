import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { mkdir } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { BackupSchedule } from '@shared/backups'
import type { ImportRequest } from '@shared/imports'
import type { ImportService } from './import/service'
import type { BackupManager } from './backups/manager'
import { IPC, type AppInfo, type FolderKind, type ServerConfigPatch } from '@shared/ipc'
import type { CreateServerRequest, SimpleProperties } from '@shared/servers'
import type { SettingsStore } from './settings'
import type { TaskManager } from './tasks'
import type { ServerManager } from './servers/manager'
import type { MojangMeta } from './core/mojang'
import type { NetworkManager } from './net/network'
import { classifyIpv4 } from './net/ipclass'
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
  network: NetworkManager
  imports: ImportService
  backups: BackupManager
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

export function registerIpc({ settings, tasks, servers, network, imports, backups, mojang, appInfo }: Deps): void {
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

  const audiences = ['self', 'lan', 'internet'] as const
  handle(IPC.networkView, (id, refresh) => network.view(str(id), refresh === true))
  handle(IPC.networkSetAudience, (id, audience) => {
    if (!audiences.includes(audience as (typeof audiences)[number])) throw new Error('Unknown choice.')
    return network.setAudience(str(id), audience as (typeof audiences)[number])
  })
  handle(IPC.networkRetry, (id) => network.retry(str(id)))
  handle(IPC.networkFixFirewall, () => network.fixFirewall())
  handle(IPC.networkDoctor, (id) => network.doctor(str(id)))
  handle(IPC.networkUseTunnel, (id) => network.useTunnel(str(id)))
  handle(IPC.networkUseDirect, (id) => network.useDirect(str(id)))
  handle(IPC.networkPlayitStatus, () => network.playitStatus())
  handle(IPC.networkUnlinkPlayit, () => network.unlinkPlayit())
  const methods = ['direct', 'manual', 'bore', 'custom'] as const
  handle(IPC.networkSetMethod, (id, method, extra) => {
    if (!methods.includes(method as (typeof methods)[number])) throw new Error('Unknown method.')
    const e = (extra ?? {}) as Record<string, unknown>
    const opt = (k: string): string | undefined => (typeof e[k] === 'string' ? (e[k] as string) : undefined)
    return network.setMethod(str(id), method as (typeof methods)[number], {
      boreRelay: opt('boreRelay'),
      customCommand: opt('customCommand'),
      customAddress: opt('customAddress')
    })
  })
  handle(IPC.networkOpenRouterPage, async (id) => {
    const gateway = (await network.view(str(id))).router.gateway
    // Only ever a private home-network address we detected ourselves.
    if (gateway && classifyIpv4(gateway) === 'private') await shell.openExternal(`http://${gateway}/`)
  })
  network.on('changed', (update) => broadcast(IPC.networkChanged, update))

  handle(IPC.importsScan, () => imports.scan())
  handle(IPC.importsPick, async (kind) => {
    const win = BrowserWindow.getFocusedWindow()
    const opts: Electron.OpenDialogOptions =
      kind === 'folder'
        ? { title: 'Choose a world, server or game folder', properties: ['openDirectory'] }
        : {
            title: 'Choose a world, server or modpack file',
            properties: ['openFile'],
            filters: [
              { name: 'Worlds, servers and modpacks', extensions: ['zip', 'mrpack', 'gz', 'tgz', 'tar'] },
              { name: 'All files', extensions: ['*'] }
            ]
          }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  handle(IPC.importsAnalyze, (path) => imports.analyze(str(path)))
  handle(IPC.importsRun, (req) => imports.run(req as ImportRequest))
  handle(IPC.importsDiscard, (id) => imports.discard(str(id)))
  handle(IPC.worldsList, (id) => servers.worlds(str(id)))
  // Switching worlds goes through backups so a safety backup is taken first.
  handle(IPC.worldsActivate, (id, slot) => backups.switchWorld(str(id), str(slot)))
  handle(IPC.worldsRemove, (id, slot) => servers.removeWorld(str(id), str(slot)))
  servers.on('worlds', (id) => broadcast(IPC.worldsChanged, id))

  // Backup ids become file names, so only accept the shape we generate.
  const backupId = (v: unknown): string => {
    const s = str(v)
    if (!/^[A-Za-z0-9-]{1,80}$/.test(s)) throw new Error('Unknown backup.')
    return s
  }
  handle(IPC.backupsView, (id) => backups.view(str(id)))
  handle(IPC.backupsNow, (id) => backups.backupNow(str(id)))
  handle(IPC.backupsSetSchedule, (id, patch) => {
    const p = (patch ?? {}) as Record<string, unknown>
    const clean: Partial<BackupSchedule> = {}
    if (p.intervalMinutes === null || typeof p.intervalMinutes === 'number') clean.intervalMinutes = p.intervalMinutes
    if (typeof p.onStop === 'boolean') clean.onStop = p.onStop
    if (typeof p.keep === 'number') clean.keep = p.keep
    if (p.location === null || (typeof p.location === 'string' && isAbsolute(p.location))) clean.location = p.location
    return backups.setSchedule(str(id), clean)
  })
  handle(IPC.backupsSetProtected, (id, b, value) => backups.setProtected(str(id), backupId(b), value === true))
  handle(IPC.backupsDelete, (id, b) => backups.delete(str(id), backupId(b)))
  handle(IPC.backupsRestore, (id, b, mode) => {
    if (mode !== 'server' && mode !== 'world') throw new Error('Unknown restore choice.')
    return backups.restore(str(id), backupId(b), mode)
  })
  handle(IPC.backupsExport, (id, b) => backups.exportZip(str(id), backupId(b)))
  handle(IPC.backupsPickLocation, async () => {
    const win = BrowserWindow.getFocusedWindow()
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose where to keep backups',
      properties: ['openDirectory', 'createDirectory']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })
  handle(IPC.backupsOpenFolder, async (id) => {
    const dir = backups.store(str(id)).dir
    await mkdir(dir, { recursive: true })
    await shell.openPath(dir)
  })
  backups.on('changed', (id) => broadcast(IPC.backupsChanged, id))
}
