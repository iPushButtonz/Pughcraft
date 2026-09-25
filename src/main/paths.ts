import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
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
/** Remembers where the library was moved to (Settings → Library folder). */
const pointerFile = (): string => join(dataRoot(), 'library.json')
let library: string | null = null

/** Servers, Java runtimes and the download cache. Read once; a move restarts the app. */
export function libraryRoot(): string {
  if (library) return library
  try {
    const p = (JSON.parse(readFileSync(pointerFile(), 'utf8')) as { path?: unknown }).path
    if (typeof p === 'string' && isAbsolute(p)) library = p
  } catch {
    // No pointer: the library lives with the app data.
  }
  return (library ??= dataRoot())
}

export const isDefaultLibrary = (dir: string): boolean => resolve(dir) === resolve(dataRoot())

/** Points the next start at a new library folder (null = back to the default). */
export async function setLibraryPointer(dir: string | null): Promise<void> {
  if (dir === null || isDefaultLibrary(dir)) await rm(pointerFile(), { force: true })
  else await writeFile(pointerFile(), JSON.stringify({ path: dir }, null, 2))
}
