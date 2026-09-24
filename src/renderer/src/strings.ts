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
    howToJoin: 'How to join',
    joinHereHint: 'In Minecraft, choose Multiplayer → Add Server and enter this address.',
    copy: 'Copy',
    copied: 'Copied',
    playersOnline: 'Players online',
    nobodyOnline: 'Nobody is online right now.'
  },
  network: {
    tab: 'Network',
    chooserTitle: 'Who’s going to play on this server?',
    chooserHint: 'You can change this any time in the Network tab.',
    audience: {
      self: { label: 'Just me', hint: 'Only this PC can join. Nothing is opened to anyone else.' },
      lan: { label: 'People on my Wi-Fi', hint: 'Anyone on the same home network can join.' },
      internet: {
        label: 'Friends anywhere',
        hint: 'Friends can join over the internet. The app sets up your router for you.'
      }
    },
    addresses: 'Addresses',
    thisPc: 'This PC',
    sameWifi: 'Same Wi-Fi',
    internet: 'Internet',
    notAvailable: 'Not available',
    firewall: 'Firewall',
    firewallOk: 'Friends are allowed through.',
    firewallFix: 'Allow through firewall',
    firewallFixHint: 'Your PC will ask for administrator permission once.',
    firewallFixed: 'Done. Friends are now allowed through the firewall.',
    firewallCancelled: 'No changes were made (the permission prompt was closed).',
    firewallFailed: 'Windows didn’t accept the change. Check the app log for details.',
    publicNetwork:
      'Windows treats this network as “Public”. That’s fine: the firewall button above covers it.',
    retry: 'Try again',
    doctor: 'Connection Doctor',
    doctorHint: 'Checks every step between your server and your friends, and tells you exactly what to fix.',
    runDoctor: 'Run Connection Doctor',
    rerun: 'Run again',
    details: 'Show details',
    hideDetails: 'Hide details',
    share: 'Share with friends',
    shared: 'Copied! Paste it to your friends.',
    shareText: (name: string, address: string, version: string) =>
      `Join my Minecraft server "${name}"!\nAddress: ${address}\nVersion: ${version}\nIn Minecraft: Multiplayer → Add Server → paste the address.`,
    consentTitle: 'Test your server from the internet?',
    consentBody:
      'To check that friends really can reach you, the Doctor can ask two outside services to try: api.ipify.org (sees your public address) and api.mcstatus.io (tries to connect to your server). Both see your public IP address. Results can be up to a minute old.',
    consentWithout:
      'Without this, the Doctor still checks everything on your PC and router, but can only guess whether the internet can reach you.',
    consentYes: 'Allow when I run the Doctor',
    consentYesHint: 'Recommended',
    consentNotNow: 'Not now',
    consentNever: 'Never',
    useTunnel: 'Use a tunnel (one click)',
    useTunnelHint: 'Works on any internet connection. Uses playit.gg, a free third-party service.',
    usingTunnel:
      'Using a playit.gg tunnel (free third-party service). Friends use this address; on this PC, join with the “This PC” address instead.',
    useDirect: 'Host directly from this PC instead',
    tunnelTitle: 'Use a playit.gg tunnel?',
    tunnelBody:
      'playit.gg is a free third-party service that lets friends reach your server without any router changes. Pughcraft downloads playit’s official helper (about 5 MB) and runs it in the background only while your server is on.',
    tunnelLinkOnce:
      'The first time, playit.gg opens in your browser so you can approve linking this PC (a guest account is fine, no sign-up form). After that it’s one click.',
    tunnelContinue: 'Continue',
    fix: {
      'start-server': 'Start the server',
      firewall: 'Allow through firewall',
      'retry-router': 'Try again',
      tunnel: 'Use a tunnel (one click)',
      guide: null,
      vpn: null,
      'choose-audience': 'Choose who can join'
    } as Record<string, string | null>
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
    privacy: 'Privacy',
    outsideChecks: 'Test servers from the internet',
    outsideChecksHint:
      'Lets the Connection Doctor ask api.ipify.org and api.mcstatus.io to reach your server from outside. They see your public IP address.',
    outsideAsk: 'Ask me',
    outsideOnDemand: 'When I run the Doctor',
    outsideNever: 'Never',
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
