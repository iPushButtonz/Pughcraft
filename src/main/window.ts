import { BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP_NAME } from '@shared/brand'
import { isAllowedExternalUrl, openExternalSafe } from './external'
import appIconPath from '../../resources/icon.png?asset'

const devServerUrl = process.env.ELECTRON_RENDERER_URL

/** True when an IPC message comes from our own UI and not some other page. */
export function isTrustedUrl(url: string | undefined): boolean {
  if (!url) return false
  if (devServerUrl) return url.startsWith(devServerUrl)
  // Only our own page: a dropped file (also file://) must never count as the app.
  return sameFileUrl(url.split(/[?#]/)[0], rendererFileUrl())
}

/** Chromium and Node may differ in escaping and drive-letter case; compare what they point at. */
function sameFileUrl(a: string, b: string): boolean {
  const norm = (u: string): string => {
    try {
      return decodeURIComponent(u).replace(/\\/g, '/').toLowerCase()
    } catch {
      return u.toLowerCase()
    }
  }
  return norm(a) === norm(b)
}

const rendererFileUrl = (): string => pathToFileURL(join(__dirname, '../renderer/index.html')).href

export function createMainWindow(opts: { show: boolean }): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    icon: appIconPath,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1f19' : '#fbfbf8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  win.removeMenu()

  win.once('ready-to-show', () => {
    if (opts.show) win.show()
  })

  // Links never open inside the app; allowed ones go to the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void openExternalSafe(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault()
  })

  if (devServerUrl) {
    // Dev conveniences: F12 for DevTools, Ctrl+R to reload.
    win.webContents.on('before-input-event', (_event, input) => {
      if (input.type !== 'keyDown') return
      if (input.key === 'F12') win.webContents.toggleDevTools()
      if (input.control && input.key.toLowerCase() === 'r') win.webContents.reload()
    })
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}
