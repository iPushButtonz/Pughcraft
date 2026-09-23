import { APP_NAME } from '@shared/brand'

/**
 * Every piece of UI text lives here so the app can be translated later.
 * Keep wording plain: the reader may never have run a server before.
 */
export const t = {
  nav: {
    servers: 'My Servers',
    settings: 'Settings'
  },
  mode: {
    simple: 'Simple',
    advanced: 'Advanced',
    hint: 'Simple shows the essentials in plain words. Advanced shows every real setting and file.'
  },
  servers: {
    title: 'My Servers',
    emptyTitle: 'No servers yet',
    emptyBody: 'Servers you create or import will show up here.'
  },
  tasks: {
    cancel: 'Cancel',
    dismiss: 'Dismiss',
    done: 'Done',
    failed: 'Failed',
    cancelled: 'Cancelled',
    working: 'Working…'
  },
  settings: {
    title: 'Settings',
    general: 'General',
    closeWindow: 'When I close the window',
    closeKeepRunning: 'Keep my servers running',
    closeKeepRunningHint: `${APP_NAME} moves to the tray and your servers stay online until you quit it or shut down the PC.`,
    closeStopAndQuit: 'Stop my servers and quit',
    closeStopAndQuitHint: 'Servers save and shut down safely, then the app closes.',
    startAtLogin: `Start ${APP_NAME} when I log in`,
    startAtLoginHint: 'Opens quietly in the tray.',
    appearance: 'Appearance',
    theme: 'Theme',
    themeSystem: 'Match my PC',
    themeLight: 'Light',
    themeDark: 'Dark',
    storage: 'Storage',
    library: 'Where servers are kept',
    openFolder: 'Open folder',
    diagnostics: 'Diagnostics',
    dataFolder: 'App data folder',
    logsFolder: 'App log files',
    about: 'About',
    version: 'Version',
    license: 'Free and open source',
    sourceCode: 'Source code'
  }
} as const
