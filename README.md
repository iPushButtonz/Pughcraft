# Pughcraft

Host a server for **Minecraft: Java Edition** on your own PC, with almost no effort.

Pughcraft is a free, open-source desktop app for Windows and Linux. It downloads the right Java and server software for you, helps your friends connect (LAN, UPnP, tunnels, or a step-by-step port-forward guide, plus a Connection Doctor that explains what's wrong), and keeps automatic backups. Simple mode uses plain words and sensible defaults; Advanced mode edits the real server files.

- Local-first: no accounts, no cloud, no telemetry.
- Java Edition only.
- Your friends join with whatever launcher they already use.

> **Status:** in development. See [SPEC.md](SPEC.md) for the full plan and [PROGRESS.md](PROGRESS.md) for where things stand.

## Building from source

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Other scripts: `npm test`, `npm run typecheck`, `npm run build`, `npm run dist:win`, `npm run dist:linux`.

## License

[GPL-3.0](LICENSE).

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.
