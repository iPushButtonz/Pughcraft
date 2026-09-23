import { app } from 'electron'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { APP_NAME } from '@shared/brand'
import { logger } from './log'

const log = logger('login-item')

/** Argument used when the OS starts us at login: open quietly in the tray. */
export const HIDDEN_ARG = '--hidden'

/** Turns "Start when I log in" on or off for the installed app. */
export async function applyStartAtLogin(enabled: boolean): Promise<void> {
  if (!app.isPackaged) {
    // A dev build would register a bare Electron binary; skip it.
    log.info(`start-at-login=${enabled} not applied in development`)
    return
  }
  if (process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] })
    return
  }
  // Linux: XDG autostart entry. AppImages must point at the .AppImage, not the mounted binary.
  const desktopFile = join(
    process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    'autostart',
    `${APP_NAME.toLowerCase()}.desktop`
  )
  if (!enabled) {
    await rm(desktopFile, { force: true })
    return
  }
  const exec = process.env.APPIMAGE || process.execPath
  await mkdir(join(desktopFile, '..'), { recursive: true })
  await writeFile(
    desktopFile,
    [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${APP_NAME}`,
      `Exec="${exec}" ${HIDDEN_ARG}`,
      'X-GNOME-Autostart-enabled=true',
      ''
    ].join('\n'),
    'utf8'
  )
}
