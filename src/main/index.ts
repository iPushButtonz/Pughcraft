import {
  app,
  BrowserWindow,
  nativeTheme,
  net,
  Notification,
  powerMonitor,
  powerSaveBlocker,
  type Tray
} from 'electron'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { APP_ID, APP_NAME } from '@shared/brand'
import type { AppInfo } from '@shared/ipc'
import { configureAppPaths, dataRoot, libraryRoot, logsDir, settingsFile } from './paths'
import { initLog, logger } from './log'
import { SettingsStore } from './settings'
import { TaskManager } from './tasks'
import { Lifecycle } from './lifecycle'
import { registerIpc } from './ipc'
import { createMainWindow } from './window'
import { createTray } from './tray'
import { applyStartAtLogin, HIDDEN_ARG } from './login-item'
import { configureHttp } from './core/http'
import { JavaManager } from './core/java'
import { MojangMeta } from './core/mojang'
import { ServerManager } from './servers/manager'

configureAppPaths()

async function start(): Promise<void> {
  await app.whenReady()
  app.setAppUserModelId(APP_ID)
  initLog(logsDir())
  const log = logger('main')
  log.info(`${APP_NAME} ${app.getVersion()} starting (electron ${process.versions.electron})`)
  await mkdir(libraryRoot(), { recursive: true })

  const settings = await SettingsStore.load(settingsFile())
  const tasks = new TaskManager()
  const lifecycle = new Lifecycle()
  nativeTheme.themeSource = settings.get().theme

  // Electron's fetch uses the system proxy settings, unlike Node's.
  configureHttp({
    version: app.getVersion(),
    fetch: (input, init) => net.fetch(input as string, init)
  })
  const mojang = new MojangMeta(join(libraryRoot(), 'cache', 'meta'))
  const java = new JavaManager(join(libraryRoot(), 'java'))
  const servers = new ServerManager({ libraryRoot, settings, tasks, java, mojang })
  await servers.load()
  lifecycle.onShutdown('servers', () => servers.stopAll(), 90_000)

  // Keep the PC awake while any server runs, unless the user turned that off.
  let sleepBlocker: number | null = null
  const updateSleepBlocker = (): void => {
    const want = settings.get().preventSleep && servers.runningCount() > 0
    if (want && sleepBlocker === null) {
      sleepBlocker = powerSaveBlocker.start('prevent-app-suspension')
    } else if (!want && sleepBlocker !== null) {
      powerSaveBlocker.stop(sleepBlocker)
      sleepBlocker = null
    }
  }
  servers.on('activity', updateSleepBlocker)

  const appInfo = (): AppInfo => ({
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    },
    paths: { library: libraryRoot(), dataRoot: dataRoot(), logs: logsDir() }
  })
  registerIpc({ settings, tasks, servers, mojang, appInfo })

  settings.on('change', (next, prev) => {
    if (next.theme !== prev.theme) nativeTheme.themeSource = next.theme
    if (next.preventSleep !== prev.preventSleep) updateSleepBlocker()
    if (next.startAtLogin !== prev.startAtLogin) {
      applyStartAtLogin(next.startAtLogin).catch((err) =>
        log.error('could not change start-at-login', err)
      )
    }
  })

  let mainWindow: BrowserWindow | null = null

  const onWindowClose = (event: Electron.Event): void => {
    if (lifecycle.isQuitting) return
    event.preventDefault()
    if (settings.get().closeBehavior === 'stop-and-quit') {
      void lifecycle.quit()
      return
    }
    mainWindow?.hide()
    if (!settings.get().trayHintShown && Notification.isSupported()) {
      new Notification({
        title: `${APP_NAME} is still running`,
        body: 'Your servers stay online. Open it again from the tray icon or the Start menu.'
      }).show()
      void settings.update({ trayHintShown: true })
    }
  }

  const openWindow = (show: boolean): BrowserWindow => {
    const win = createMainWindow({ show })
    win.on('close', onWindowClose)
    // Windows: logging off or shutting down. Time is short, so start stopping right away.
    win.on('session-end', () => void lifecycle.quit())
    win.on('closed', () => {
      if (mainWindow === win) mainWindow = null
    })
    return win
  }

  /** Brings the window back, rebuilding it if it was ever destroyed. */
  const showMainWindow = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = openWindow(true)
      return
    }
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  // Anything that asks the app to quit goes through the lifecycle so servers get stopped first.
  app.on('before-quit', (event) => {
    if (lifecycle.isQuitting) return
    event.preventDefault()
    void lifecycle.quit()
  })
  // Servers keep running with no window open; the tray keeps the app alive.
  app.on('window-all-closed', () => undefined)
  app.on('second-instance', showMainWindow)
  // Linux: delay the OS shutdown while servers save and stop.
  // (Electron's typings omit the event argument that its docs describe.)
  const onShutdown = (event: Electron.Event): void => {
    event.preventDefault()
    void lifecycle.quit()
  }
  powerMonitor.on('shutdown', onShutdown as unknown as () => void)

  const tray: Tray = createTray({ open: showMainWindow, quit: () => void lifecycle.quit() })
  // Keep a reference so the tray icon is never garbage-collected.
  lifecycle.onShutdown('tray', async () => tray.destroy(), 1000)

  const startHidden = process.argv.includes(HIDDEN_ARG)
  mainWindow = openWindow(!startHidden)
  log.info(`ready (hidden start: ${startHidden})`)
}

if (!app.requestSingleInstanceLock()) {
  // Another copy is already running; it will show its window via 'second-instance'.
  app.quit()
} else {
  start().catch((err) => {
    logger('main').error('failed to start', err)
    app.exit(1)
  })
}
