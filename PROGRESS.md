# Pughcraft — Progress

Read SPEC.md (source of truth) and this file at the start of every session. Update this file after each major piece.

## Done
- 2026-09-23: Interview complete; SPEC.md approved.
- 2026-09-23: **Step 1 — skeleton** done and verified in the running app:
  - Electron 44 + electron-vite 5 (Vite 7) + React 19 + Tailwind 4 + shadcn/ui. TypeScript 6.
  - Settings store (`settings.json`, validated, atomic writes).
  - Rotating app log (`logs/pughcraft.log`).
  - Task system with throttled progress, cancel and dismiss.
  - Lifecycle with shutdown hooks. The tray keeps the app alive.
  - Closing the window hides it (or quits, per setting). A second launch reopens and rebuilds the window if needed.
  - Start at login.
  - Theme.
  - Simple/Advanced switch.
  - 9 unit tests pass.

## Next
- **Step 2 ★: create and run a server.**
  1. Version/loader picker.
  2. Java auto-download (Adoptium).
  3. Server install (vanilla/Paper/Fabric/Forge/NeoForge via @xmcl).
  4. EULA.
  5. Start/stop and console.
  6. Status.
  7. Basic real `server.properties` settings.
  8. Prevent-sleep.
  9. Stop servers in the lifecycle shutdown hook.
  10. Library location move.

## How to test the running app (dev)
- `npm run dev:debug` starts the app with CDP on 9222 (UI) and 9229 (main process).
- `node scripts/cdp.mjs shot <file>` takes a screenshot.
- `node scripts/cdp.mjs clicktext "<label>"`
- `node scripts/cdp.mjs eval "<js>"`
- `node scripts/cdp.mjs main "<js>"` (`electron` is in scope).
- The computer-use tool cannot target the dev Electron window; use the CDP script instead.
- Dev and installed builds share `%APPDATA%\Pughcraft`. Delete `settings.json` after testing to reset.

## Open items / waiting on owner
- CurseForge API key: owner applies on the CurseForge developer console. Builds work without it.
- SignPath Foundation: apply after the first public release.

## Working rules (from owner)
- Ask with multiple-choice popups, recommended option first.
- Stop and ask before: a hard-to-swap library or service, any SPEC change, something that can't be done as specced, or a real tradeoff.
- Demo after each ★ step in SPEC §13, then ask for changes.
- Small decisions: pick the sensible option and keep going.
- Every release gets a version bump plus a CHANGELOG entry.
