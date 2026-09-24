# Pughcraft — Specification

Status: **APPROVED 2026-09-23** · Repo: https://github.com/iPushButtonz/Pughcraft
This file is the source of truth. Any change to it needs the owner's approval first.

## 1. What it is

An open-source, local-first desktop app that lets anyone host a **Minecraft: Java Edition server** on their own PC with almost no effort, while giving experienced users full manual control.

- **Server only.** No player launcher and no game launching. Friends join with whatever launcher they already use. The app gives the host an address and a matching client mod pack to share.
- Java Edition only. No Bedrock.
- Windows + Linux. No macOS.
- Name "Pughcraft" is a placeholder and lives in one constant (`APP_NAME`) so it can be renamed.
- No accounts of our own, no cloud, no telemetry. Nothing depends on a project website.
- **No Microsoft login is needed**, because the app never launches the game. See §11 for what registering a Microsoft app ID would involve if a player launcher is ever added.

Out of scope: player launcher, Microsoft/Xbox auth, Bedrock, macOS, remote web panel, hosting in the cloud.

## 2. Tech stack

| Part | Choice |
|---|---|
| App shell | Electron (latest stable) |
| UI | React + TypeScript + Tailwind + shadcn/ui |
| Build / package | electron-vite, electron-builder (Windows NSIS per-user installer; Linux AppImage + .deb) |
| Minecraft logic | `@xmcl/*` libraries (MIT) for reading mods and world files (mod metadata, NBT), pinned to known-good versions and wrapped behind our own interfaces. Server installs use official sources per §4.3. *(Owner-approved change, 2026-09-23.)* |
| Tests | Vitest for core logic |

Architecture: the Electron **main process** does all I/O (downloads, extraction, server processes, networking, backups). The **renderer** is UI only and talks to main through a typed IPC API (context isolation on, no Node in the renderer). Every slow job runs as a cancellable *task* that streams progress (bytes, files, current step) to the UI. The UI must never look frozen.

## 3. Where things live

- App data and library: `%APPDATA%\Pughcraft` (Linux `~/.local/share/pughcraft`). The library location can be moved in Settings. The app warns when the chosen folder is inside OneDrive, Dropbox or Google Drive, because syncing corrupts running worlds.
- `java/`: auto-downloaded runtimes, shared across servers.
- `cache/`: downloads stored by hash.
- `servers/<id>/`: one folder per server:
  - `server/`: the real server directory (jar, `server.properties`, mods/plugins/config, active world).
  - `worlds/`: inactive worlds. Switching worlds (server stopped) swaps folders by rename, which is instant.
  - `backups/`: that server's snapshots.
  - `pughcraft.json`: name, MC version, loader + version, Java, RAM, port, network state.

## 4. Server manager

### 4.1 My Servers
A card per server shows name, status (Stopped / Starting / Running / Crashed), players online/max, version + loader, address and a Start/Stop button. Beside the cards: a big **Create server** button and a drop zone.

### 4.2 Create and import
Ways to start a server:
- **New:** pick a Minecraft version and a loader.
- **Drag and drop:** world folder, world .zip/.tar.gz (including Realm backups), existing server folder, server-pack zip, Modrinth `.mrpack`, CurseForge modpack zip.
- **Import from launchers installed on this PC:** the official launcher, Prism, the CurseForge app and the Modrinth App (their worlds and instances).
- **In-app modpack browser:** Modrinth, plus CurseForge when the build has a key.

Pipeline: **Scan and detect** (progress UI) → **Review screen**, before anything is created → **Create** (copy / extract / download with progress, cancellable, rolled back on failure).

The review screen shows the detected version, loader + loader version, required Java, suggested RAM, and the mod list split into *server*, *client-only (removed)* and *needs attention*. Everything shown can be edited.

Detection:
- **World:** `level.dat` → version name / DataVersion; mod data hints at the loader.
- **Server folder:** jars, `libraries/`, loader files (`.fabric/`, Forge/NeoForge libraries, Paper config), `mods/`, `plugins/`.
- **Mods:** `fabric.mod.json`, `quilt.mod.json`, `mods.toml`, `neoforge.mods.toml`, `mcmod.info`. Hash lookups on Modrinth (sha1) and CurseForge (fingerprint) add side and dependency info.
- **Java:** from Mojang's version data (`javaVersion`). The range is 8 → 25.

**Player instance / modpack → server** makes sure the versions match exactly and removes client-only mods, in layers:
1. The mod's own manifest (e.g. Fabric `environment: client`).
2. Modrinth / CurseForge side metadata.
3. A built-in list of known client-only mods.
4. A trial start. If the crash names a client-only mod, the app moves that jar to `mods-client-only/` (never deletes it), retries and reports what it did.

**Compatibility check:** MC version and loader version ranges, missing dependencies (offer to install), declared conflicts, duplicate mods. Honest limit: a conflict that no mod declares only appears at first start. The crash analyzer then names the suspect mod when it can.

### 4.3 Java and server software
- **Java:** Eclipse Temurin (Adoptium API) auto-downloaded in the needed major version (8/16/17/21/25), checksum-verified. The user never touches Java. In Advanced, the user can pick any installed Java.
- **Server software**, always downloaded at runtime from official sources and never bundled:
  - Vanilla: Mojang piston-meta.
  - Paper: PaperMC API.
  - Fabric: Fabric meta server launcher.
  - Forge / NeoForge: their official installers, run headless, with output parsed into progress.
- **Supported versions:** Minecraft **1.7 and newer**. Support for everything older comes after the app is complete (§12).
- An imported server that runs other software (Purpur, Spigot, …) works as a **Custom jar**: it runs, but the app doesn't manage its updates.

### 4.4 EULA
Before a server's first start, the app shows Mojang's EULA link and an **unchecked** "I agree to the Minecraft EULA" box. Only after the user ticks it does the app write `eula=true`. The agreement is remembered with its date. Later servers show "You agreed on <date>" with the link. It is never auto-accepted.

### 4.5 Dashboard tabs
- **Overview:** status, Start / Stop / Restart, CPU/RAM, players online (kick/op/ban), address and **Share with friends**.
- **Console:** live log and a command box.
- **Players:** whitelist toggle, whitelist, ops, bans. While the whitelist is on, a popup shows "Alex tried to join — Allow?" and one click lets them in.
- **Mods / Plugins:** list, enable/disable, update, add, export a player pack (§6).
- **Worlds:** list, switch, import, export, new world with seed.
- **Backups** (§5) and **Network** (§7).
- **Settings:** Simple or Advanced (§8).
- **Files:** Advanced only. File browser and text editor on the real files.

### 4.6 Process lifecycle
- Servers are child processes of the app, with stdin/stdout piped for the console.
- **Default: once started, a server stays on.** Closing the window hides the app to the tray. Servers stop only when the app is force-closed or the PC shuts down. On shutdown/logoff the app sends `stop` right away so the world saves.
- Options in Settings: "When I close the window: keep servers running (default) / stop servers and quit", and "Start Pughcraft when I log in + auto-start these servers" (off by default).
- The PC is kept from sleeping while any server runs (default on).
- Graceful stop: `stop` command, wait up to 60 s, then kill.
- Crashes: auto-restart (max 3 per 10 min). The crash analyzer gives one plain-English reason and a fix button. It knows these cases: out of memory, wrong Java, port in use, missing dependency, client-only mod, version mismatch.
- Several servers can run at once. Each gets a free port, starting at 25565.

## 5. Backups (local, automatic)

- **Smart snapshots:** each file is stored once by content hash, so a backup only adds the files that changed. Every snapshot still restores on its own, and any snapshot can be exported to a normal `.zip`.
- **Hot backups while running:** `save-off` → `save-all flush` → wait for "Saved the game" → snapshot → `save-on`.
- **Automatic:** every hour, but only if someone played since the last backup, and when the server stops. By default the **newest 5** are kept; Simple mode has a "Keep [5] backups" setting.
- **Manual backups** are kept until deleted.
- **Safety backups** are always taken before a restore, a version or loader change, a world switch and mod changes. They are kept 14 days.
- **Protect flag:** a protected backup is never deleted automatically.
- **Restore:** the whole server or just a world, rolling back to any snapshot. The server is stopped first, after asking.
- **Sizes:** each backup shows the new data it added. A total shows the disk used by all backups.
- **Location:** inside the server folder by default. In Advanced, backups can go to any folder or drive.

## 6. Mods, plugins and player packs

- **Modrinth** is the primary source (open API). Requests identify the app with the repo URL, never a personal email.
- **CurseForge:**
  - Needs an API key. The owner applies for it; it is injected at build time from a CI secret and never committed. Forks need their own key. Builds without a key show "CurseForge unavailable in this build".
  - Some authors block downloads by other apps. For those mods the app lists them, opens each page in the browser, watches the Downloads folder, matches the file by fingerprint and moves it into place automatically.
- **Paper plugins:** Modrinth + Hangar.
- Dependencies are resolved automatically. Updates show changelogs. Disabling a mod moves it to `mods-disabled/`.
- **Player pack export** (what friends load into their own launcher):
  - `.mrpack` for Prism, the Modrinth App and others.
  - CurseForge-format zip.
  - Plain mods-folder zip, with steps for the official launcher.
  - Contents: every mod the client needs, plus the original pack's client-only mods when the server came from a modpack. Mods that aren't on Modrinth or CurseForge are embedded as files, with a note to respect each mod's license.

## 7. Networking (most important)

### 7.1 Share with friends
One button copies a plain-English message containing the best current address, the exact version and loader, and "get the mod pack here" (the exported file) when the server is modded.

### 7.2 Fallback ladder
The app walks the ladder automatically and explains each step:
1. **Same wifi (LAN):** local IP with a Copy button. Virtual adapters are skipped.
2. **UPnP / NAT-PMP:** ask the router to open the TCP port. The app detects success or failure, renews the lease, removes the mapping on stop and reads the router's WAN IP.
3. **Tunnel.** Optional and clearly labelled third-party; the app works without it. Choices:
   - **playit.gg** (default). Its open-source agent is downloaded on demand from playit's official GitHub and checksum-verified. Linking takes a one-time browser step (a guest account works).
   - **bore** (Linux only). No account, but the public relay is unreliable. A user's own bore server also works. Hidden on Windows because Windows Defender flags bore as a trojan (a false positive for tunnel tools). *(Owner-approved change, 2026-09-24.)*
   - **Custom** (Advanced): any command plus an address.
4. **Manual port-forward guide:** detects the router brand (UPnP device info or gateway MAC vendor). Shows steps filled in with the user's exact local IP, port and TCP, an **Open router settings** button, a reminder to reserve the PC's local IP, and tips for common brands. There is no giant per-model database, because that would be a maintenance trap.
5. **VPN mesh:** Tailscale and ZeroTier. The app detects whether they're installed and running, shows the mesh IP and walks the user through setup. Friends install the same VPN. It can't be embedded, because both need their own accounts.

### 7.3 Firewall
On a server's first start, the app explains, then shows **one admin prompt**. It adds a narrow allow rule (our Java only, the server's TCP port, all network profiles). It also removes the block rules Windows creates when someone clicks Cancel on the Windows firewall popup. The same prompt adds a UDP rule for Pughcraft itself, from the **local network only**, so the app can hear router replies (UPnP/NAT-PMP) on networks Windows marks as "Public". *(Owner-approved addition, 2026-09-23.)* On Linux, the same is done through ufw or firewalld via pkexec, if one is active.

### 7.4 Connection Doctor
The Doctor diagnoses rather than guesses. It runs checks in order and stops at the first failure. The output is **one plain-English result plus a fix button**.
1. Is the server running and listening locally? (TCP connect + Server List Ping to 127.0.0.1)
2. Is the OS firewall blocking it? (our rule, block rules, network profile; ufw/firewalld)
3. Router: UPnP mapping present? Router WAN IP?
4. CGNAT or double NAT:
   - A WAN IP in 100.64.0.0/10 means CGNAT.
   - A private WAN IP means double NAT.
   - A WAN IP that differs from the public IP means CGNAT is likely.
5. Reachable from the internet? A public checker (mcstatus.io) pings the public address.

Example results: "Your internet provider shares one address between many homes (CGNAT), so port forwarding can't work. Click here to use a tunnel instead." / "Windows Firewall is blocking the server. Click to fix (admin prompt)."

**Outside services are off until opted in.** Checks 4 and 5 need outside services (a public-IP lookup and the checker). The first time they're needed, a popup explains:
- they see the user's public IP;
- results can lag about a minute because of the checker's cache;
- without them, the Doctor can only guess reachability.

The popup recommends **"on demand"** (contact them only when the user runs the Doctor or clicks Test). Other choices: always ask, or never. The choice can be changed in Settings.

## 8. Settings: Simple / Advanced / Automatic

One app-wide **Simple / Advanced** switch in the top bar, remembered. Simple pages have "Show in Advanced" links. Advanced edits the **real files**, not stand-in settings.

| Simple (plain words) | Advanced (real files and values) | Automatic (never shown) |
|---|---|---|
| Server name, message in server list | Full `server.properties` editor (every key with descriptions, plus raw text view) | `eula.txt` after consent |
| Game mode, difficulty, hardcore | JVM arguments, Java picker, exact Xms/Xmx | Java download and selection |
| Max players, PvP, whitelist on/off | Port, server-ip, online-mode (with warning) | Loader installation |
| Allow flying / command blocks | Loader and version change, server jar | Free-port selection |
| RAM slider with recommended mark | File browser and editor, console | Paper performance JVM flags (visible in Advanced) |
| Performance: Low / Balanced / High (sets view and simulation distance; the real values show in Advanced) | Backup schedule, retention, location | Firewall rule, UPnP renewal and cleanup |
| New world seed | Tunnel and custom tunnel config, UPnP on/off | Safety backups, log rotation, crash restarts |
| Keep [N] backups | Prevent-sleep, auto-restart limits, library location | |

## 9. Privacy: every outside contact

| Service | When |
|---|---|
| Mojang (piston-meta / piston-data) | Getting server jars and version data |
| Adoptium | Downloading Java |
| PaperMC, Fabric, Forge, NeoForge | Installing a loader |
| Modrinth, CurseForge, Hangar | Browsing or installing mods |
| playit.gg / bore | Only if that tunnel is chosen |
| mcstatus.io + public-IP lookup | Only after opt-in |
| GitHub | Only if update checks are opted in |

No telemetry. Installed servers keep working fully offline (LAN).

## 10. Distribution

- Public GitHub repo, created by the owner. GitHub Actions builds Windows + Linux.
- **Signing:** SignPath Foundation (free for open source), applied for after the first release. Unsigned builds run fine meanwhile; other users see the SmartScreen "More info → Run anyway" screen.
- **Updates:** on first launch the app asks whether to check GitHub for updates. It never installs without asking. The choice can be changed in Settings.
- Semantic versions, a `CHANGELOG.md` entry and a versioned GitHub release for every update.

## 11. Legal

- Licensed **GPL-3.0**.
- Never redistribute Mojang files. Everything is downloaded from official sources at runtime. The EULA is handled as in §4.4.
- Mojang brand rules: "Minecraft" is not in the app name. The tagline is "for Minecraft: Java Edition". About/footer: "Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft."
- The playit agent (BSD-2) is downloaded at runtime and not bundled.
- **Microsoft app ID: not needed.** If a player launcher is ever added:
  1. Register an app in Microsoft Entra (Azure portal): personal Microsoft accounts, "Allow public client flows" = Yes for device-code login.
  2. Submit Mojang's AppID review form (aka.ms/mce-reviewappid).
  3. Until approved, Minecraft login returns "403 Invalid app registration". The approval wait is unknown.

## 12. After the app is complete
- Support Minecraft versions older than 1.7. The owner asked for this as a follow-up.

## 13. Build order

The app runs at every step. After each ★, the owner gets a demo and a chance to ask for changes.

1. **Skeleton:** Electron + React window, My Servers (empty), Simple/Advanced switch, tray and close behaviour, data folders, task and progress system.
2. **★ Create and run a server:** version/loader picker → Java auto-download → server install → EULA → start/stop → console → status → basic settings on the real `server.properties`.
3. **★ Networking:** LAN, UPnP, firewall rule, Connection Doctor, tunnels, port-forward guide, VPN detection, Share button.
4. **★ Import:** drag-drop, detection, review screen, launcher imports, modpacks, client-mod stripping, compatibility check, crash analyzer.
5. **★ Backups.**
6. **Players and worlds:** whitelist and Allow popup, ops/bans, world switching, file browser.
7. **★ Mods and plugins:** Modrinth/CurseForge/Hangar browser, updates, blocked-mod flow, player pack export.
8. **★ Release:** installers, updater, CI, first GitHub release, SignPath application.

## 14. Defaults picked without asking (owner may veto any)

1. Build tools: electron-vite + electron-builder. Windows installer is per-user (no admin). Linux ships AppImage + .deb.
2. Java comes from Eclipse Temurin (Adoptium) and is shared between servers.
3. The library lives in `%APPDATA%\Pughcraft`. It can be moved, with a warning for cloud-synced folders.
4. Server types: Vanilla, Paper, Fabric, Forge, NeoForge. Anything else runs as a Custom jar.
5. Tunnel choices: playit.gg (default), bore, custom.
6. Backups: smart snapshots, hourly only if someone played, plus on stop. Keep 5 automatic backups; safety backups kept 14 days.
7. RAM: vanilla/Paper 3 GB; modded 4 / 6 / 8 GB by mod count (<50 / 50–150 / 150+). Always capped so the PC keeps 4 GB free.
8. Port 25565, or the next free one. Several servers can run at once.
9. `online-mode` stays on, so players need real accounts. Offline mode is only possible in Advanced, with a warning.
10. Crashes auto-restart (max 3 per 10 min) and get plain-English crash reasons.
11. The PC won't sleep while a server runs. "Start with Windows" is off by default.
12. The player pack is exported as .mrpack, a CurseForge zip and a mods zip.
13. English only, but all text lives in one strings file so translations can be added.
14. Theme follows the system (dark/light).
15. Testing: Claude runs real servers headless through the app itself and never launches game clients. The owner's Prism instances are never touched.
