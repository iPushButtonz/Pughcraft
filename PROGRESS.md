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

## Next
- Step 3 approved by the owner 2026-09-24.
- **Step 4 ★: import** (main test: owner's world zip). Owner decisions 2026-09-24:
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
