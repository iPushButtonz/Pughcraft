import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'
import type { FoundItem, Launcher } from '@shared/imports'
import { readLevelDat } from './leveldat'
import { logger } from '../log'

const log = logger('scan')

/**
 * Looks through the launchers installed on this PC for worlds and modded instances.
 * Read-only and local: nothing is changed and nothing leaves the PC.
 */

function launcherRoots(): { launcher: Launcher; kind: 'saves' | 'instances'; path: string }[] {
  const home = homedir()
  const appData = process.platform === 'win32' ? app.getPath('appData') : join(home, '.local', 'share')
  const dotMinecraft = process.platform === 'win32' ? join(appData, '.minecraft') : join(home, '.minecraft')
  return [
    { launcher: 'official', kind: 'saves', path: join(dotMinecraft, 'saves') },
    { launcher: 'prism', kind: 'instances', path: join(appData, 'PrismLauncher', 'instances') },
    { launcher: 'curseforge', kind: 'instances', path: join(home, 'curseforge', 'minecraft', 'Instances') },
    { launcher: 'modrinth', kind: 'instances', path: join(appData, 'ModrinthApp', 'profiles') },
    { launcher: 'modrinth', kind: 'instances', path: join(appData, 'com.modrinth.theseus', 'profiles') }
  ]
}

async function worldItem(dir: string, launcher: Launcher, instance: string | null): Promise<FoundItem | null> {
  const ld = join(dir, 'level.dat')
  if (!existsSync(ld)) return null
  try {
    const level = await readLevelDat(await readFile(ld))
    return {
      kind: 'world',
      launcher,
      name: level.levelName,
      path: dir,
      instance,
      mcVersion: level.versionName,
      loader: null,
      lastPlayed: (await stat(ld)).mtime.toISOString()
    }
  } catch {
    return null
  }
}

async function instanceInfo(dir: string): Promise<{ name: string; gameDir: string; mcVersion: string | null; loader: string | null } | null> {
  const gameDir = existsSync(join(dir, 'minecraft')) ? join(dir, 'minecraft') : existsSync(join(dir, '.minecraft')) ? join(dir, '.minecraft') : dir
  let name = dir.split(/[\\/]/).pop() ?? 'Instance'
  let mcVersion: string | null = null
  let loader: string | null = null
  try {
    if (existsSync(join(dir, 'mmc-pack.json'))) {
      const pack = JSON.parse(await readFile(join(dir, 'mmc-pack.json'), 'utf8')) as { components?: { uid: string; version?: string }[] }
      for (const c of pack.components ?? []) {
        if (c.uid === 'net.minecraft') mcVersion = c.version ?? null
        if (c.uid === 'net.fabricmc.fabric-loader') loader = 'Fabric'
        if (c.uid === 'net.minecraftforge') loader = 'Forge'
        if (c.uid === 'net.neoforged') loader = 'NeoForge'
        if (c.uid === 'org.quiltmc.quilt-loader') loader = 'Quilt'
      }
      const cfg = await readFile(join(dir, 'instance.cfg'), 'utf8').catch(() => '')
      name = /^name=(.+)$/m.exec(cfg)?.[1]?.trim() ?? name
    } else if (existsSync(join(dir, 'minecraftinstance.json'))) {
      const inst = JSON.parse(await readFile(join(dir, 'minecraftinstance.json'), 'utf8')) as { name?: string; gameVersion?: string; baseModLoader?: { name?: string } }
      name = inst.name ?? name
      mcVersion = inst.gameVersion ?? null
      loader = inst.baseModLoader?.name?.split('-')[0] ?? null
    } else if (existsSync(join(dir, 'profile.json'))) {
      const p = JSON.parse(await readFile(join(dir, 'profile.json'), 'utf8')) as { metadata?: { name?: string; game_version?: string; loader?: string } }
      name = p.metadata?.name ?? name
      mcVersion = p.metadata?.game_version ?? null
      loader = p.metadata?.loader ?? null
    } else if (!existsSync(join(gameDir, 'mods')) && !existsSync(join(gameDir, 'saves'))) {
      return null
    }
  } catch {
    // Keep the defaults.
  }
  return { name, gameDir, mcVersion, loader }
}

async function lastModified(path: string): Promise<string | null> {
  try {
    return (await stat(path)).mtime.toISOString()
  } catch {
    return null
  }
}

export async function scanLaunchers(): Promise<FoundItem[]> {
  const found: FoundItem[] = []
  for (const root of launcherRoots()) {
    if (!existsSync(root.path)) continue
    try {
      for (const name of await readdir(root.path)) {
        const dir = join(root.path, name)
        if (root.kind === 'saves') {
          const w = await worldItem(dir, root.launcher, null)
          if (w) found.push(w)
          continue
        }
        const inst = await instanceInfo(dir)
        if (!inst) continue
        const modsDir = join(inst.gameDir, 'mods')
        if (existsSync(modsDir) && (await readdir(modsDir)).some((f) => f.endsWith('.jar'))) {
          found.push({
            kind: 'instance',
            launcher: root.launcher,
            name: inst.name,
            path: dir,
            instance: null,
            mcVersion: inst.mcVersion,
            loader: inst.loader,
            lastPlayed: await lastModified(modsDir)
          })
        }
        const saves = join(inst.gameDir, 'saves')
        if (existsSync(saves)) {
          for (const w of await readdir(saves)) {
            const item = await worldItem(join(saves, w), root.launcher, inst.name)
            if (item) found.push(item)
          }
        }
      }
    } catch (err) {
      log.warn(`could not scan ${root.path}`, err)
    }
  }
  return found.sort((x, y) => (y.lastPlayed ?? '').localeCompare(x.lastPlayed ?? ''))
}
