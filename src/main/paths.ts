import { app } from 'electron'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { APP_NAME } from '@shared/brand'

/**
 * Points Electron at our folders. Must run before the app is ready.
 * Our own data (settings, logs, servers) lives in `userData`; Chromium's caches
 * go to `sessionData` so they never mix with server files.
 */
export function configureAppPaths(): void {
  app.setName(APP_NAME)
  const slug = APP_NAME.toLowerCase()
  if (process.platform === 'win32') {
    app.setPath('userData', join(app.getPath('appData'), APP_NAME))
    const local = process.env.LOCALAPPDATA ?? app.getPath('appData')
    app.setPath('sessionData', join(local, APP_NAME, 'electron'))
  } else {
    const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
    const cacheHome = process.env.XDG_CACHE_HOME || join(homedir(), '.cache')
    app.setPath('userData', join(dataHome, slug))
    app.setPath('sessionData', join(cacheHome, slug))
  }
}

export const dataRoot = (): string => app.getPath('userData')
export const settingsFile = (): string => join(dataRoot(), 'settings.json')
export const logsDir = (): string => join(dataRoot(), 'logs')
/** Servers, Java runtimes and the download cache. */
export const libraryRoot = (): string => dataRoot()
