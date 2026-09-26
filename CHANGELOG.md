# Changelog

All notable changes to Pughcraft. Versions follow [Semantic Versioning](https://semver.org).

## [0.2.2] - 2026-09-26

### Fixed
- Drag and drop works anywhere in the window, including while the Import screen is open (before, only the small box on that screen took drops). Dropping a new file there starts over with that file.
- A file dropped where nothing takes it can no longer open inside the app window. Only the app's own page is trusted.

## [0.2.1] - 2026-09-25

### Added
- Server icon in Settings, under Message of the day: drop an image on it or click to choose one, and it's resized to 64×64. There is also a Remove button.
- Every setting and game rule has a one-line description that follows its value. Switches say what on or off does (for example "Phantoms spawn" / "Phantoms don't spawn"). Numbers and dropdowns describe the value picked (for example "Idle players are never kicked" at 0).

## [0.2.0] - 2026-09-25

### Changed
- Settings tab now has a real control for every `server.properties` setting (switches, numbers, dropdowns, text), grouped and searchable. The World detail presets and explanatory text are gone; view and simulation distance are exact numbers.
- Players moved into the Settings tab (there is no separate Players tab).
- Game rules no longer show on/off blurbs; every rule is a plain control with "Use normal".
- The header no longer says "My Servers", and the sidebar lists your servers with their status instead of one lone tab.
- Backups can run as soon as the last player leaves (on by default), on top of the timer and stop backups.
- New world (Worlds tab) offers world type, generator settings, structures, game mode, difficulty, hardcore and max world size, as well as name and seed.
- Import: the settings wizard (name and icon, version and type, memory, summary) opens as soon as you drop a file while it is checked in the background, with a Skip button. The dialog no longer repeats "Checking…"; progress shows once in the task toast as "Installing…".
- Import screen is now titled "Settings" and says whether previous settings were found.
- Memory slider explains each choice (too low, below average, best for most, and so on) and works past 32 GB on PCs with enough RAM.
- Imported servers can get a custom icon (`server-icon.png`).

### Added
- App skeleton: Electron + React window with My Servers and Settings pages.
- One app-wide Simple / Advanced switch.
- Closing the window keeps the app (and servers) running in the tray; opening the app again brings the window back. Option to stop servers and quit instead.
- Start at login (opens quietly in the tray).
- Light, dark or match-the-PC theme.
- Background task system with live progress, cancel and error reporting.
- App log file with rotation.
- Create servers: Vanilla, Paper, Fabric, Forge or NeoForge, for Minecraft 1.7 and newer. The form covers name, version, type, game mode, difficulty, seed, whitelist and memory. The Minecraft EULA must be ticked by the user.
- Java is downloaded automatically (Eclipse Temurin, checksum-verified). Users never install Java.
- Server software comes from official sources at runtime, with checksums. Forge/NeoForge use their own installers.
- Old versions (1.7–1.18.0) get Mojang's official Log4Shell fix automatically.
- New servers start by themselves once setup finishes.
- Server dashboard:
  - live status and players;
  - "join from this PC" address;
  - console with command history;
  - Start/Stop/Restart/Force stop.
- Settings:
  - Simple mode edits the real server.properties: game mode, difficulty, hardcore, PvP, flying, command blocks, max players, whitelist, performance preset, memory.
  - Advanced adds the full file editor, JVM arguments, exact memory, port.
- Crashed servers restart automatically (up to 3 times in 10 minutes) and explain what went wrong in plain English.
- Quitting the app saves and stops every server first. The PC is kept awake while a server runs (can be turned off in Advanced).
- Deleting a server moves it to the Recycle Bin.
- Networking:
  - "Who's going to play?" (Just me / People on my Wi-Fi / Friends anywhere) is asked on first start. Addresses for each are shown with copy buttons.
  - Automatic router setup (UPnP, then NAT-PMP). The port opens while the server runs and closes when it stops.
  - One-click Windows Firewall fix (single admin prompt, narrow rules). It also works on networks Windows marks as "Public".
  - Built-in playit.gg tunnel for networks where the router can't be opened. Linking takes one browser approval; after that it's one click. The address stays the same, and the helper runs invisibly only while the server is on.
  - Connection Doctor: checks each step and gives one plain-English answer with a fix button. Tests from the internet only run with your permission.
  - Step-by-step port-forward guide with your exact values and tips for common router brands (the brand is detected automatically).
  - Detects Tailscale/ZeroTier addresses. Advanced: bore and custom tunnels.
  - "Share with friends" copies a ready-to-paste invite.
- The Minecraft EULA is asked on first start if it hasn't been agreed to yet.
- Import:
  - Drop a world, Realm backup, server folder, server pack or Modrinth modpack anywhere on the window. You can also pick one from worlds and modpacks found in Minecraft Launcher, Prism, the CurseForge app and the Modrinth App.
  - The app works out the version and server type and shows a review screen before anything is created. Every step shows progress.
  - Worlds can become a new server or be added to an existing one.
  - Mods that only work in the game are left out automatically. Duplicate mods are set aside, never deleted.
  - If a game-only mod still breaks the first start, it is moved aside and the server tries again.
- Worlds tab: keep several worlds per server and switch between them instantly.
- Crash messages now name the mod that's missing or doesn't belong, and explain worlds from newer versions.
- Backups tab:
  - Smart backups: each backup only stores what changed, yet restores on its own. A 200 MB world backs up again in about a second.
  - You choose when backups happen, per server: every 15 minutes while people play by default, when the server stops, and a "Back up now" button that always works. Backups are skipped when nobody played.
  - A slider sets how often (Off, 5, 10, 15, 20, 30, 45 minutes), or type any number of minutes. A line underneath says how far back your backups reach, with a caution below 15 minutes.
  - Backups of a running server pause saving for a moment so no file is caught half-written. Players can keep playing.
  - Keeps the newest 10 automatic backups (adjustable). Backups you make yourself are kept until you delete them, and any backup can be protected.
  - Restore the whole server (world, settings, mods and the Minecraft version) or only the world. A safety backup of how things were is always taken first.
  - Save any backup as a normal .zip. Advanced: move backups to another folder or drive.
- Switching worlds now takes a safety backup first.
- Players tab: see who's online, manage the whitelist, operators and bans, and kick players, whether the server is on or off.
- When someone who isn't on the whitelist tries to join, a popup with a sound lets you allow them in one click.
- Game rules: every rule for your world's Minecraft version, each explaining what on and off do. They start at Minecraft's normal values. Changes made while the server is off apply on its next start.
- Files tab (Advanced): browse and edit the server's files. A setting controls editing while the server runs.
- CPU and memory use on the server's Overview.
- Worlds: save a world as a .zip, or make a new world with its own name and seed.
- Choose which servers start automatically when Pughcraft opens.
- Advanced: move the whole library (servers, Java, downloads) to another folder or drive.

### Changed
- Brand green is a little brighter.

### Fixed
- Chat messages like "<Alex> : Steve joined the game" could fool the player list.
