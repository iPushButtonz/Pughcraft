# Pughcraft — Progress

Read SPEC.md (source of truth) and this file at the start of every session. Update this file after each major piece.

## Done
- 2026-09-23: Interview complete; SPEC.md approved. §2 wording updated with the owner's OK: @xmcl is for mod/world reading; installs use official sources.
- 2026-09-23: **Step 1 — skeleton.**
  - Electron 44 + electron-vite 5 (Vite 7) + React 19 + Tailwind 4 + shadcn/ui. TypeScript 6.
  - Settings, rotating log, task/progress system.
  - Lifecycle with shutdown hooks, tray, single instance, start at login, theme, Simple/Advanced switch.
- 2026-09-23: **Step 2 ★ — create and run a server.** Verified in the running app:
  - Version catalog (Mojang manifest, offline cache). Loader lists: Paper fill v3, Fabric meta, Forge maven + promos, NeoForge API (1.20.1 legacy `forge` artifact plus the new 26.x numbering).
  - Java auto-download: Temurin JRE via Adoptium, sha256-verified, majors 8/11/17/21/25.
  - Installs:
    - vanilla/Paper/Fabric download jars (checksums where available);
    - Forge/NeoForge run their official installers headless;
    - Forge < 1.13 gets the vanilla jar pre-placed, because old installers use a dead Mojang URL.
  - Log4Shell: Mojang's official mitigation is applied automatically to 1.7–1.18.0 (not needed for Paper, NeoForge, or Forge 1.12+).
  - JVM flags: Aikar-style set trimmed to options valid on Java 8–25, plus UTF-8 console flags.
  - Server lifecycle:
    - Start/stop/restart/force stop, live console, commands with history, player join/leave tracking.
    - Crashes: auto-restart (3 per 10 min) with plain-English reasons (`servers/crash.ts`).
    - Port pre-check. Ports are allocated under a lock.
    - Quitting stops all servers safely.
    - Prevent-sleep while running.
  - Setup screen:
    - Create dialog asks name, version, type, **plus game mode, difficulty, seed, whitelist** (owner's choice), memory, and EULA (unticked).
    - Advanced mode adds snapshots, loader version and port.
  - **New servers auto-start after setup** (owner's choice).
  - Dashboard: Overview (status, "join from this PC" address, players), Console, Settings.
    - Settings Simple mode edits the real server.properties.
    - Advanced adds the raw editor, JVM args, exact MB, port and Java info.
    - A restart-needed banner appears when a running server's settings change.
  - Delete moves the server folder to the Recycle Bin.
  - Smoke-tested (`scripts/smoke-servers.mjs`), all online and stopped cleanly:
    - vanilla 1.21.4 / 1.12.2 / 26.3;
    - Paper 1.21.4, Fabric 1.21.4;
    - Forge 1.20.1 / 1.7.10, NeoForge 1.21.1;
    - owner's world (southbendindianaminecraftworld.zip, MC 26.2 "Transfer world") on vanilla 26.2.
  - 15 unit tests pass. Production build OK.

- 2026-09-24: **Step 3 ★ — networking** built and verified on the owner's PC:
  - **Owner's network:** Wi-Fi 192.168.50.154, router 192.168.50.1 = MikroTik RouterOS. UPnP and NAT-PMP are off, and the owner has no router access. Windows marks the network as "Public".
  - **Network tab:**
    - First-start "who's going to play" (also asked from the Start button).
    - Addresses: this PC / Wi-Fi / internet.
    - Firewall status and fix; Doctor.
    - Advanced: other ways (direct/manual/playit/bore/custom) and Tailscale/ZeroTier.
  - **Share with friends** button (copies an invite with the best address).
  - **Firewall fix** (one UAC prompt, clicked by the owner):
    - TCP 25565–25664 for each managed Java;
    - UDP from LocalSubnet for the app (SPEC §7.3 addition, approved);
    - removes Windows' block rules for our Java.
    - Verified rules are narrow.
  - **UPnP/NAT-PMP client:**
    - Written from scratch.
    - SSDP verified working (5 other devices answered; the router didn't).
    - Mapping add/remove has **not** run against a real UPnP router yet: the owner's router has it off.
  - **Connection Doctor:** one verdict plus a fix button. Outside checks are opt-in via a consent popup (owner's rule).
  - **playit.gg built in, verified end to end:**
    - The pinned v1.0.10 signed agent runs hidden with `--secret-path`, `--socket-path` and `--log-path`.
    - Owner linked a guest account.
    - Tunnel `laurel-geneva.tun.ply.gg` reached the owner's world from the internet (checked via mcstatus.io).
    - The helper starts and stops with the server; the address stays stable.
    - NOTE: connecting to the tunnel from the same home network gets reset (no hairpin). The UI tells the host to use "This PC".
  - Port-forward guide with the exact values, router brand from its login page, and brand tips.
  - bore (pinned v0.6.0) and custom tunnels in Advanced. **Not yet tested end to end:** bore needs the owner's OK to download for a test.
  - EULA prompt added to Start (it was only in Create before).
  - 48 unit tests pass.

- 2026-09-24: **Step 4 ★ — import** built and verified:
  - **Detection** (`import/analyze.ts`):
    - worlds (folder/zip/Realms .tar.gz, level.dat via @xmcl/nbt, brands → loader hint);
    - server folders (Neo/Forge libraries, Fabric, Paper, vanilla `version.json`, custom jars);
    - instances (Prism mmc-pack, CurseForge app, Modrinth App profile.json);
    - `.mrpack` (env.server);
    - CurseForge zips blocked with a server-pack tip (no API key yet);
    - Bedrock and .jar are refused.
  - **Mods** (`import/mods.ts`): reads fabric/quilt/neoforge/forge toml and mcmod.info, including jar-in-jar ids.
    - Sides are decided by the mod itself → Modrinth by sha1 → the built-in list. A mod a server mod needs is never removed.
    - Missing dependencies and duplicates are reported. Duplicates: the newest is kept, the rest go to `mods-disabled/`.
  - **Trial start:** a startup crash from a game-only class moves that jar to `mods-client-only/` and retries (max 10).
  - **Crash analyzer** names missing mods, wrong loader, duplicates and newer worlds.
  - **Import screen:** drop anywhere or pick a file/folder; "Found on this PC" lists launcher worlds and instances; review screen; EULA; progress.
    - Worlds ask "new server or add to existing" (owner's choice).
    - Adding a world to a server on an older version is refused.
  - **Worlds tab:** list, switch (rename-based, server must be stopped), delete to Recycle Bin, add.
  - **Verified on real data:**
    - Owner's world zip → Fabric 26.2 server, running.
    - Owner's Prism "modded" instance (58 mods) → 48 on the server; 6 game-only left out; 4 duplicates set aside; running.
    - Server-folder import reused the existing launcher and ran in 25 s.
    - World add, switch and switch back all work.
    - The 26.3→26.2 guard fires. Realms tar.gz and the CF message are correct.
  - **.mrpack tested live** (owner OK'd a small download).
    - I used a mini pack of 3 real Modrinth mods (~4 MB), because real 26.2 packs list 100+ mods.
    - Fabric API and Lithium downloaded and passed their sha512 checks. Mod Menu (server unsupported) was left out.
    - overrides and server-overrides were copied; client-overrides were skipped.
    - Running in 63 s. The test server was deleted afterwards.
  - Bug found and fixed: the archive type is now detected by magic bytes (.mrpack is a zip).
  - The console dims known-harmless warnings (Perflib, Unsafe).
  - Caught and fixed PowerShell encoding damage (see memory: no PowerShell text rewrites).
- **Step 5 ★ backups: done (2026-09-24), awaiting demo feedback.**
  - **Store** (`src/main/backups/store.ts`): content-addressed. `objects/<aa>/<sha256>` plus `snapshots/<id>.json` manifests.
    - Size+mtime reuse the previous hash, so unchanged files aren't re-read.
    - Covers `server/` and `worlds/`. Skips logs, crash-reports, cache, .fabric, debug, session.lock and *.log.
    - Retention: newest `keep` auto backups; safety backups kept 14 days; manual and protected ones never pruned. GC removes unused objects.
    - Restore modes: whole server (also removes files and world slots added since, and brings back the software config) or world only (level + _nether/_the_end).
    - Export .zip (yazl) and move to another folder.
  - **Manager** (`src/main/backups/manager.ts`):
    - One job at a time per server.
    - A start gate: Start waits for a running backup, and is refused during a restore. A server counts as live while it's launching.
    - Timer every N minutes, only if someone was online since the last backup. On-stop backup after clean stops only (not crashes, not app quit).
    - Hot backups use save-off → `save-all flush` → wait for "Saved the game" → copy → save-on.
    - World switches go through a safety backup.
  - **UI:** Backups tab.
    - Simple: 30-minute switch, on-stop switch, keep N, "Back up now".
    - Advanced: exact minutes and folder.
    - List: kind badge, reason, sizes, restore dialog (whole server or world only, with version notes), protect, export, delete.
  - **Verified live on "Transfer world"** (Fabric 26.2, 217 MB):
    - The first backup took under a second; later ones added 0.4–3 KB.
    - Hot backup console sequence was correct. The 5-minute timer fired on time. On-stop backup worked.
    - World-only restore removed the stray file and kept the settings. Whole-server restore brought the MOTD back.
    - A world switch took a safety backup, and a restore undid the switch. Start during a restore was refused.
    - Exported a 273-entry .zip and moved backups away and back.
    - EULA reset afterwards; schedule back to defaults.
  - Also fixed: join/leave detection now needs `]: ` before the name, so chat can't fake players (with tests).
  - Dev only: `globalThis.__pughcraftDev` = {servers, backups, settings} for `cdp.mjs main` (not in packaged builds).

## Next
- Step 5 demo → owner feedback, then ask step-6 parameters (players/whitelist "Allow?" popup, ops/bans, game rules, file browser, library move, CPU/RAM).
- **Step 4 background (done).** Owner decisions 2026-09-24:
  - **Dropping a single world asks:** "Make a new server" (pre-selected) or "Add to <existing server> as another world".
  - **The Import screen scans installed launchers when it opens.** Covers the official launcher, Prism, the CurseForge app and the Modrinth App. It's local-only, read-only, and copies files, never changes them.
- **Step 3 background (done).** Owner decisions (2026-09-23):
  - **Who can join is asked on first start:** "Just me / People on my Wi-Fi / Friends anywhere", changeable in the Network tab. "Friends anywhere" walks the ladder automatically.
  - **Host directly off the PC first** (UPnP/NAT-PMP; no extra apps, one click).
  - **playit.gg is the fallback,** built in. Its agent is downloaded and run invisibly; there is a one-time browser link (guest account OK). bore and custom tunnels stay as Advanced options (SPEC §7.2).
  - **Planned sub-order:**
    1. LAN + Network tab + first-start prompt + Share.
    2. Firewall.
    3. UPnP/NAT-PMP + CGNAT.
    4. Outside checks + Doctor.
    5. playit.
    6. Guide/VPN/bore/custom.
  - **Safety rules for testing:**
    - Claude must not add firewall rules or open router ports itself. Read-only checks are fine.
    - The owner clicks the app's buttons for real firewall/UPnP changes (UAC prompts are theirs).
    - Downloading the playit agent for a test needs the owner's OK first.
  - Look into Forge's "LanServerPinger: Network is unreachable" warning on this PC (maybe Proton VPN or IPv6).
- Test servers cleaned up 2026-09-23 (8 moved to Recycle Bin). Kept: "Transfer world test" (owner's 26.2 world copy).

## Test environment caveat (important)
- Processes Claude launches run inside the Claude app's MSIX sandbox. `%APPDATA%\Pughcraft` is redirected to `C:\Users\nicho\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Pughcraft`, although paths look normal from inside.
- So all test data (the owner's world copy, Java, the playit link) lives only there. An owner-run build starts fresh.
- Firewall program-path rules must be verified with an owner-run build.
- bore: tested 2026-09-24. Defender flagged it "Trojan:Win32/Kepavll!rfn" and removed it. Now hidden on Windows (SPEC §7.2, owner-approved).

## Moved / deferred (and why)
- Library "move to another folder" moved from step 2 to step 6. Its move logic is easier to get right alongside the file browser.
- Game rules (pvp/command blocks on 1.21.9+, which moved out of server.properties) go to step 6 as per-world game rules. Simple mode hides those switches for 1.21.9+ until then.
- CPU/RAM usage on Overview: step 6.

## Test data (owner-approved)
- Owner's world `%USERPROFILE%\Downloads\southbendindianaminecraftworld.zip` (26.2): use it again as the main step-4 import test. Always use a copy; never modify the original.
- Owner OK'd accepting the Minecraft EULA for test servers. After testing, reset it by deleting `%APPDATA%\Pughcraft\settings.json` so the app asks the owner normally.

## How to test the running app (dev)
- `npm run dev:debug` starts the app with CDP on 9222 (UI) and 9229 (main process).
- `node scripts/cdp.mjs shot|eval|click|clicktext|main|errors|pages`
  - `errors` reloads the UI and prints exceptions.
- `node scripts/smoke-servers.mjs "<server name>" …` starts, waits, reports and stops each server.
- The computer-use tool cannot target the dev Electron window; use the CDP script.
- Zustand selectors must return stable values (no `.map`/`Object.values` inside a selector) or React loops forever.

## Open items / waiting on owner
- CurseForge API key: owner applies on the CurseForge developer console. Builds work without it.
- SignPath Foundation: apply after the first public release.

## Working rules (from owner)
- Ask with multiple-choice popups, recommended option first. Ask parameters before starting each new piece of work.
- Stop and ask before: a hard-to-swap library or service, any SPEC change, something that can't be done as specced, or a real tradeoff.
- Demo after each ★ step in SPEC §13, then ask for changes.
- Small decisions: pick the sensible option and keep going.
- Every release gets a version bump plus a CHANGELOG entry.
