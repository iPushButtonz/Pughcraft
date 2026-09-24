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
