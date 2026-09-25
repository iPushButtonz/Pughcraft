# Pughcraft UI guide

Everything you need to change how Pughcraft looks and reads. All paths are relative to `C:\Users\nicho\Pughcraft`.

## Quick start

1. Open a terminal in `C:\Users\nicho\Pughcraft`.
2. Run `npm run dev`. The app opens, and **most UI edits show up instantly** after you save a file (no restart).
3. When you're happy, build the real app and refresh the taskbar version (see [Updating the taskbar app](#updating-the-taskbar-app)).

Changes to files under `src/main` (window size, tray, etc.) need the dev app closed and reopened.

## What the UI is built with

| Piece | What it does | Where |
|---|---|---|
| React 19 + TypeScript | Screens and components (`.tsx` files) | `src/renderer/src` |
| Tailwind CSS 4 | Styling via class names like `px-4 text-sm bg-card` | classes inside `.tsx` files |
| shadcn/ui (Radix) | Buttons, dialogs, switches, tabs, sliders… | `src/renderer/src/components/ui` |
| lucide-react | Icons (`<Server />`, `<Settings />`…) | browse at https://lucide.dev/icons |
| sonner | Pop-up toasts (bottom corner) | `components/ui/sonner.tsx` |
| zustand | Shared state (current page, servers, settings) | `src/renderer/src/stores` |

## Colours, fonts, corners (the theme)

**File: `src/renderer/src/styles.css`** — this is the single best place to start customizing.

- `:root { … }` = light mode colours. `.dark { … }` = dark mode colours. Change both.
- Colours use `oklch(lightness chroma hue)`:
  - lightness 0–1 (0 black, 1 white)
  - chroma 0–~0.37 (0 grey, higher = more vivid)
  - hue 0–360 (27 red, 75 amber, 142 green, 250 blue, 300 purple)
  - Normal hex like `#6cc24a` also works if you prefer.
- Main tokens:

| Token | Used for |
|---|---|
| `--primary` / `--primary-foreground` | Brand green: main buttons, switches, links, focus ring (`--ring`) |
| `--background` / `--foreground` | Page background and normal text |
| `--card` | Cards and panels |
| `--muted` / `--muted-foreground` | Soft backgrounds and grey hint text |
| `--accent` | Hover highlights |
| `--destructive` | Delete / Stop / errors (red) |
| `--warning`, `--success` | Caution notes, "Online" badges |
| `--border`, `--input` | Lines and input outlines |
| `--sidebar*` | Left sidebar colours |
| `--radius` | Corner roundness everywhere (0 = square, 1rem = very round) |

- In class names these become `bg-primary`, `text-muted-foreground`, `border-border`, etc.
- **Font:** `body { font-family: … }` in the same file. To use a custom font, put the `.woff2` file in `src/renderer/src/assets/`, add an `@font-face` rule in `styles.css`, then list it first in `font-family`. (Web fonts from the internet are blocked by the app's security policy in `src/renderer/index.html`, so bundle the file.)
- **Scrollbars:** `::-webkit-scrollbar*` rules at the bottom of `styles.css`.
- **Window background while loading:** `backgroundColor` in `src/main/window.ts` — keep it close to `--background` so there's no flash.

## Text and wording

**File: `src/renderer/src/strings.ts`** — every piece of text in the app lives here, grouped by area:

`nav`, `mode`, `servers`, `imports`, `worlds`, `backups`, `eula`, `loaders`, `create`, `dashboard`, `players`, `gamerules`, `files`, `autoStart`, `library`, `editFiles`, `network`, `console`, `serverSettings`, `tasks`, `settings`.

- Edit the text in quotes. Some entries are small functions, e.g. `players: (online, max) => …` — keep the `${…}` parts.
- Game rule names and on/off descriptions are in `src/shared/gamerules.ts` (`title`, `on`, `off`).
- App name / tagline: `src/shared/brand.ts`.

## Layout map

```
App.tsx
├── Sidebar (left)            components/layout/Sidebar.tsx   — logo, "My Servers", Settings at bottom
├── Header bar (top)          App.tsx <header>                — page title + Simple/Advanced switch (layout/ModeSwitch.tsx)
├── Page area
│   ├── My Servers            pages/ServersPage.tsx           — server cards, Create / Import buttons
│   ├── One server            pages/ServerPage.tsx            — tabs:
│   │     Overview            (in ServerPage.tsx: status, address, players, CPU/RAM card)
│   │     Players             components/servers/PlayersPanel.tsx
│   │     Network             components/network/NetworkPanel.tsx (+ DoctorCard, PortForwardGuide, TunnelButton, ShareButton, OtherWays, AudienceChooser)
│   │     Worlds              components/servers/WorldsPanel.tsx
│   │     Backups             components/servers/BackupsPanel.tsx
│   │     Console             components/servers/ConsoleView.tsx
│   │     Settings            components/servers/ServerSettingsPanel.tsx (+ GameRulesSection.tsx)
│   │     Files (Advanced)    components/servers/FilesPanel.tsx
│   └── Settings (app)        pages/SettingsPage.tsx
├── TaskTray                  components/TaskTray.tsx         — download/backup progress panel
├── GlobalImport              components/imports/GlobalImport.tsx — drag-and-drop anywhere
└── JoinRequests              components/servers/JoinRequests.tsx — "Allow?" popup + chime sound
```

Dialogs: `CreateServerDialog.tsx`, `EulaDialog.tsx`, `imports/ImportDialog.tsx`, `PromptDialog.tsx`.
Small shared pieces: `SettingRow.tsx` (label + description + control row), `CopyField.tsx`, `Segmented.tsx`, `StatusBadge.tsx`, `PowerButtons.tsx`, `TaskProgress.tsx`.

- Sidebar width: `w-56` in `Sidebar.tsx`. Header height: `h-14` in `App.tsx`. Page padding: `px-6 py-6` in `App.tsx`.
- Tab order / names: the `<TabsTrigger>` list in `pages/ServerPage.tsx` (labels in `strings.ts`: `dashboard.tabs` for Overview/Console/Settings, and `players.tab`, `network.tab`, `worlds.tab`, `backups.tab`, `files.tab` for the rest).
- Window size: `width: 1180, height: 760, minWidth: 900` in `src/main/window.ts`.

## Base components (look of every button, switch, dialog…)

`src/renderer/src/components/ui/*.tsx`. Changing one changes it everywhere.

- `button.tsx` — the `variants` list: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`, and sizes `sm`, `default`, `lg`, `icon`.
- `card.tsx`, `dialog.tsx`, `switch.tsx`, `tabs.tsx`, `slider.tsx`, `badge.tsx`, `input.tsx`, `select.tsx`, `sonner.tsx` (toast style/position).

## Logo and icons

- In-app logo: `components/Logo.tsx` (SVG polygons with hex colours).
- App / taskbar / tray icons: generated from the SVG in `scripts/make-icons.mjs`. Edit it, then run `npm run icons` to write `resources/icon.png` and `resources/tray.png`. Copy `resources/icon.png` over `build/icon.png` too (used for the .exe icon).

## Tailwind cheat sheet

| Want | Class |
|---|---|
| Spacing | `p-4` padding, `px-6` sides, `mt-2` top margin, `gap-3` space between items |
| Text | `text-xs / sm / base / lg / xl`, `font-medium / semibold`, `text-muted-foreground` |
| Colour | `bg-primary`, `text-primary`, `bg-card`, `border-destructive` |
| Layout | `flex`, `items-center`, `justify-between`, `grid grid-cols-2` |
| Corners / borders | `rounded-md / lg / xl`, `border`, `border-b` |
| Size | `w-56`, `h-14`, `size-4` (icons) |
| Dark-only tweak | `dark:bg-black` |

Docs: https://tailwindcss.com/docs

## Rules to keep things working

- Keep colours as tokens in `styles.css` rather than hard-coding hex in components, so light and dark mode both work.
- Don't rename exported component names or `strings.ts` keys unless you update every place that uses them. `npm run typecheck` will tell you what broke.
- Simple vs Advanced: pieces shown only in Advanced check `mode === 'advanced'` from `useSettings`. Keep those checks if you move things around.
- Don't edit files under `node_modules`, `out`, `dist` or `app` — they're generated.

## Checking and updating

- `npm run typecheck` — catches mistakes after editing.
- `npm test` — runs the tests (UI edits rarely affect them).

### Updating the taskbar app

The pinned Pughcraft runs from `C:\Users\nicho\Pughcraft\app`. After customizing:

1. Quit Pughcraft (tray icon → Quit), so its files aren't locked.
2. Run:
   ```
   npm run build
   npx electron-builder --win --dir -c.electronDist=node_modules/electron/dist
   ```
3. Copy everything in `dist\win-unpacked` into `app` (replace all).
4. Open Pughcraft from the taskbar.

If something goes wrong, `git checkout -- <file>` puts a file back to the last saved version, and `git diff` shows what you changed.
