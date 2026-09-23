import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type PughcraftApi } from '@shared/ipc'

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: PughcraftApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    openFolder: (which) => ipcRenderer.invoke(IPC.appOpenFolder, which),
    openExternal: (url) => ipcRenderer.invoke(IPC.appOpenExternal, url)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
    onChange: (listener) => subscribe(IPC.settingsChanged, listener)
  },
  tasks: {
    list: () => ipcRenderer.invoke(IPC.tasksList),
    cancel: (id) => ipcRenderer.invoke(IPC.tasksCancel, id),
    dismiss: (id) => ipcRenderer.invoke(IPC.tasksDismiss, id),
    onUpdate: (listener) => subscribe(IPC.tasksUpdated, listener),
    onRemove: (listener) => subscribe(IPC.tasksRemoved, listener)
  }
}

contextBridge.exposeInMainWorld('pughcraft', api)
