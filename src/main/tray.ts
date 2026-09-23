import { Menu, Tray, nativeImage } from 'electron'
import { APP_NAME } from '@shared/brand'
import trayIconPath from '../../resources/tray.png?asset'

export function createTray(actions: { open: () => void; quit: () => void }): Tray {
  const tray = new Tray(nativeImage.createFromPath(trayIconPath))
  tray.setToolTip(APP_NAME)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `Open ${APP_NAME}`, click: actions.open },
      { type: 'separator' },
      { label: `Quit ${APP_NAME}`, click: actions.quit }
    ])
  )
  // Windows: a left click opens the window. Linux trays often only show the menu.
  tray.on('click', actions.open)
  return tray
}
