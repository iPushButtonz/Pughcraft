import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type PughcraftApi } from '@shared/ipc'

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

const api: PughcraftApi = {
  app: {
    info: () => invoke(IPC.appInfo),
    openFolder: (which) => invoke(IPC.appOpenFolder, which),
    openExternal: (url) => invoke(IPC.appOpenExternal, url)
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    update: (patch) => invoke(IPC.settingsUpdate, patch),
    onChange: (listener) => subscribe(IPC.settingsChanged, listener)
  },
  tasks: {
    list: () => invoke(IPC.tasksList),
    cancel: (id) => invoke(IPC.tasksCancel, id),
    dismiss: (id) => invoke(IPC.tasksDismiss, id),
    onUpdate: (listener) => subscribe(IPC.tasksUpdated, listener),
    onRemove: (listener) => subscribe(IPC.tasksRemoved, listener)
  },
  catalog: {
    mcVersions: () => invoke(IPC.catalogMcVersions),
    loaders: (mc) => invoke(IPC.catalogLoaders, mc),
    memory: () => invoke(IPC.catalogMemory)
  },
  servers: {
    list: () => invoke(IPC.serversList),
    create: (request) => invoke(IPC.serversCreate, request),
    retryInstall: (id) => invoke(IPC.serversRetryInstall, id),
    start: (id) => invoke(IPC.serversStart, id),
    stop: (id) => invoke(IPC.serversStop, id),
    restart: (id) => invoke(IPC.serversRestart, id),
    kill: (id) => invoke(IPC.serversKill, id),
    command: (id, text) => invoke(IPC.serversCommand, id, text),
    console: (id) => invoke(IPC.serversConsole, id),
    properties: (id) => invoke(IPC.serversProperties, id),
    setSimple: (id, patch) => invoke(IPC.serversSetSimple, id, patch),
    setRaw: (id, text) => invoke(IPC.serversSetRaw, id, text),
    update: (id, patch) => invoke(IPC.serversUpdate, id, patch),
    remove: (id) => invoke(IPC.serversRemove, id),
    openFolder: (id) => invoke(IPC.serversOpenFolder, id),
    onChanged: (listener) => subscribe(IPC.serversChanged, listener),
    onRemoved: (listener) => subscribe(IPC.serversRemoved, listener),
    onConsole: (listener) => subscribe(IPC.serversConsoleLines, listener)
  },
  network: {
    view: (id, refreshFirewall) => invoke(IPC.networkView, id, refreshFirewall),
    setAudience: (id, audience) => invoke(IPC.networkSetAudience, id, audience),
    retry: (id) => invoke(IPC.networkRetry, id),
    fixFirewall: () => invoke(IPC.networkFixFirewall),
    doctor: (id) => invoke(IPC.networkDoctor, id),
    useTunnel: (id) => invoke(IPC.networkUseTunnel, id),
    useDirect: (id) => invoke(IPC.networkUseDirect, id),
    playitStatus: () => invoke(IPC.networkPlayitStatus),
    unlinkPlayit: () => invoke(IPC.networkUnlinkPlayit),
    onChanged: (listener) => subscribe(IPC.networkChanged, listener)
  }
}

contextBridge.exposeInMainWorld('pughcraft', api)
