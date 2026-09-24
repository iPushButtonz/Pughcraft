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
    emptyBody: 'Create your first server. It takes about a minute.',
    create: 'Create server',
    players: (online: number, max: number | null) =>
      max ? `${online} of ${max} players` : `${online} player${online === 1 ? '' : 's'}`,
    start: 'Start',
    stop: 'Stop',
    restart: 'Restart',
    neverStarted: 'Never started',
    lastStarted: (when: string) => `Last started ${when}`,
    status: {
      installing: 'Setting up…',
      stopped: 'Stopped',
      starting: 'Starting…',
      running: 'Online',
      stopping: 'Stopping…',
      crashed: 'Crashed'
    }
  },
  loaders: {
    vanilla: 'Plain Minecraft, exactly as Mojang makes it.',
    paper: 'A faster vanilla server that supports plugins.',
    fabric: 'Lightweight mods; popular on newer versions.',
    forge: 'The classic choice for big modpacks.',
    neoforge: 'The modern successor to Forge for newer modpacks.'
  },
  create: {
    title: 'Create a server',
    name: 'Server name',
    namePlaceholder: 'My Server',
    version: 'Minecraft version',
    latest: 'latest',
    showSnapshots: 'Show snapshots (test versions)',
    type: 'Server type',
    loaderVersion: 'Loader version',
    memory: 'Memory',
    memoryRecommended: 'recommended',
    memoryHint: (gb: string) => `How much of your PC's memory the server may use. ${gb} is a good start.`,
    port: 'Port',
    portAuto: 'Automatic (25565 or the next free one)',
    gameplay: 'Gameplay',
    seed: 'World seed',
    seedPlaceholder: 'Leave empty for a random world',
    whitelist: 'Only allow players I add (whitelist)',
    whitelistHint: 'Off: anyone with the address can join. You can change this any time.',
    eula: 'I agree to the',
    eulaLink: 'Minecraft End User License Agreement',
    eulaAgreed: (date: string) => `You agreed to the Minecraft EULA on ${date}.`,
    cancel: 'Cancel',
    submit: 'Create server',
    loading: 'Checking what’s available…'
  },
  dashboard: {
    back: 'My Servers',
    tabs: { overview: 'Overview', console: 'Console', settings: 'Settings' },
    installing: 'Setting up this server. You can keep using the app meanwhile.',
    retrySetup: 'Retry setup',
    openFolder: 'Open server folder',
    forceStop: 'Force stop (no save)',
    delete: 'Delete server…',
    deleteTitle: (name: string) => `Delete ${name}?`,
    deleteBody:
      'The server, its worlds and its backups move to the Recycle Bin, so you can still get them back from there.',
    deleteConfirm: 'Delete',
    restartNeeded: 'Restart the server to apply your changes.',
    statusLine: {
      installing: 'Setting up…',
      stopped: 'The server is off.',
      starting: 'Starting up. The first start can take a minute while the world is created.',
      running: 'The server is online.',
      stopping: 'Saving the world and shutting down…',
      crashed: 'The server stopped unexpectedly.'
    },
    joinHere: 'Join from this PC',
    joinHereHint: 'In Minecraft, choose Multiplayer → Add Server and enter this address.',
    copy: 'Copy',
    copied: 'Copied',
    playersOnline: 'Players online',
    nobodyOnline: 'Nobody is online right now.'
  },
  console: {
    placeholder: 'Type a command, e.g. say Hello or op YourName',
    notRunning: 'Start the server to send commands.',
    send: 'Send'
  },
  serverSettings: {
    general: 'General',
    name: 'Server name',
    motd: 'Message in the server list',
    gameplay: 'Gameplay',
    gamemode: 'Game mode',
    gamemodes: { survival: 'Survival', creative: 'Creative', adventure: 'Adventure', spectator: 'Spectator' },
    difficulty: 'Difficulty',
    difficulties: { peaceful: 'Peaceful', easy: 'Easy', normal: 'Normal', hard: 'Hard' },
    hardcore: 'Hardcore',
    hardcoreHint: 'One life. Players who die become spectators.',
    pvp: 'Players can hurt each other (PvP)',
    allowFlight: 'Allow flying',
    allowFlightHint: 'Stops the server kicking players who fly with mods or creative tricks.',
    commandBlocks: 'Command blocks',
    players: 'Players',
    maxPlayers: 'Maximum players',
    whitelist: 'Only allow people on the whitelist',
    whitelistHint: 'When on, only players you add can join.',
    performance: 'Performance',
    performanceLabel: 'World detail',
    performanceHint: 'How far players can see and how much of the world stays active. Lower is lighter on your PC.',
    performances: { low: 'Low', balanced: 'Balanced', high: 'High', custom: 'Custom' },
    memory: 'Memory',
    firstStartNote:
      'Some settings appear after the server has started once, because the server creates its full settings file on first start.',
    advancedTitle: 'server.properties',
    advancedHint: 'The real settings file. Changes take effect on the next start.',
    save: 'Save',
    revert: 'Revert',
    saved: 'Saved',
    jvmArgs: 'JVM arguments',
    jvmArgsHint: 'One per line. Memory (-Xmx/-Xms) is set by the Memory setting.',
    memoryExact: 'Memory (MB)',
    port: 'Port',
    java: 'Java',
    javaAuto: (major: number) => `Automatic (Java ${major})`
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
    preventSleep: 'Keep the PC awake while a server is running',
    preventSleepHint: 'If the PC goes to sleep, everyone on your server is disconnected.',
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
