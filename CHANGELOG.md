# Changelog

All notable changes to Pughcraft. Versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

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
  - You choose when backups happen, per server: every 30 minutes while people play (any interval in Advanced), when the server stops, and a "Back up now" button that always works. Backups are skipped when nobody played.
  - Backups of a running server pause saving for a moment so no file is caught half-written. Players can keep playing.
  - Keeps the newest 10 automatic backups (adjustable). Backups you make yourself are kept until you delete them, and any backup can be protected.
  - Restore the whole server (world, settings, mods and the Minecraft version) or only the world. A safety backup of how things were is always taken first.
  - Save any backup as a normal .zip. Advanced: move backups to another folder or drive.
- Switching worlds now takes a safety backup first.

### Changed
- Brand green is a little brighter.

### Fixed
- Chat messages like "<Alex> : Steve joined the game" could fool the player list.
