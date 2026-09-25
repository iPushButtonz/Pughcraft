import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { shell } from 'electron'
import type { WorldInfo } from '@shared/imports'
import { copyDir, dirSize } from '../core/fsutil'
import { readLevelDat } from '../import/leveldat'
import { PropertiesFile } from './properties'

/**
 * A server's worlds. The active one lives in the server folder under `level-name`
 * (plus Paper's `_nether` / `_the_end` folders); the others wait in `worlds/<slot>/`
 * as `main`, `main_nether`, `main_the_end`. Switching just renames folders, so it's instant.
 */

const DIM_SUFFIXES = ['', '_nether', '_the_end']

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'world'
  )
}

/** A name the user gave a world in Pughcraft, kept next to its level.dat. */
const NAME_FILE = 'pughcraft-world.json'

async function givenName(dir: string): Promise<string | null> {
  try {
    const data = JSON.parse(await readFile(join(dir, NAME_FILE), 'utf8')) as { name?: unknown }
    return typeof data.name === 'string' && data.name.trim() ? data.name.trim() : null
  } catch {
    return null
  }
}

async function levelInfo(dir: string): Promise<{ levelName: string; mcVersion: string | null; lastPlayed: string | null }> {
  const named = await givenName(dir)
  try {
    const file = join(dir, 'level.dat')
    const info = await readLevelDat(await readFile(file))
    return { levelName: named ?? info.levelName, mcVersion: info.versionName, lastPlayed: (await stat(file)).mtime.toISOString() }
  } catch {
    return { levelName: named ?? 'World', mcVersion: null, lastPlayed: null }
  }
}

export class WorldStore {
  constructor(
    private readonly serverDir: string,
    private readonly storeDir: string
  ) {}

  async levelName(): Promise<string> {
    const file = join(this.serverDir, 'server.properties')
    if (!existsSync(file)) return 'world'
    return PropertiesFile.parse(await readFile(file, 'utf8')).get('level-name') || 'world'
  }

  private async freeSlot(name: string): Promise<string> {
    await mkdir(this.storeDir, { recursive: true })
    const base = slugify(name)
    for (let i = 1; ; i++) {
      const slot = i === 1 ? base : `${base}-${i}`
      if (!existsSync(join(this.storeDir, slot))) return slot
    }
  }

  async list(): Promise<WorldInfo[]> {
    const out: WorldInfo[] = []
    const ln = await this.levelName()
    const active = join(this.serverDir, ln)
    if (existsSync(join(active, 'level.dat'))) {
      const info = await levelInfo(active)
      let size = 0
      for (const s of DIM_SUFFIXES) size += await dirSize(join(this.serverDir, ln + s))
      out.push({ slot: ln, active: true, sizeBytes: size, ...info })
    } else if (existsSync(join(active, NAME_FILE))) {
      // A new world waiting for the server to generate it on the next start.
      out.push({ slot: ln, active: true, sizeBytes: 0, levelName: (await givenName(active)) ?? 'New world', mcVersion: null, lastPlayed: null, pending: true })
    }
    if (existsSync(this.storeDir)) {
      for (const slot of await readdir(this.storeDir)) {
        const main = join(this.storeDir, slot, 'main')
        if (!existsSync(join(main, 'level.dat'))) continue
        const info = await levelInfo(main)
        out.push({ slot, active: false, sizeBytes: await dirSize(join(this.storeDir, slot)), ...info })
      }
    }
    return out
  }

  /** Copies a world folder in as another (inactive) world. */
  async add(source: string, name: string, opts: { signal?: AbortSignal; onProgress?: (d: number, t: number) => void } = {}): Promise<string> {
    const slot = await this.freeSlot(name)
    await copyDir(source, join(this.storeDir, slot, 'main'), {
      ...opts,
      filter: (rel) => rel !== 'session.lock'
    })
    await writeFile(join(this.storeDir, slot, 'main', NAME_FILE), JSON.stringify({ name, addedAt: new Date().toISOString() }))
    return slot
  }

  /** Moves the active world (if any) into the store, under a free slot. */
  private async parkActive(): Promise<void> {
    const ln = await this.levelName()
    const current = join(this.serverDir, ln)
    if (!existsSync(current)) return
    if (!existsSync(join(current, 'level.dat'))) {
      // A new world that was never generated: nothing to keep.
      await rm(current, { recursive: true, force: true })
      return
    }
    const info = await levelInfo(current)
    const parking = join(this.storeDir, await this.freeSlot(info.levelName))
    await mkdir(parking, { recursive: true })
    for (const s of DIM_SUFFIXES) {
      if (existsSync(join(this.serverDir, ln + s))) await rename(join(this.serverDir, ln + s), join(parking, 'main' + s))
    }
    // Keep the name it showed while active.
    if (!existsSync(join(parking, 'main', NAME_FILE))) {
      await writeFile(join(parking, 'main', NAME_FILE), JSON.stringify({ name: info.levelName }))
    }
  }

  /** Makes `slot` the active world; the current one moves into the store. Server must be stopped. */
  async activate(slot: string): Promise<void> {
    const target = join(this.storeDir, slot)
    if (!existsSync(join(target, 'main', 'level.dat'))) throw new Error('That world no longer exists.')
    const ln = await this.levelName()
    // Worlds added before names moved next to level.dat kept the name in the slot folder.
    const legacyName = await givenName(target)
    if (legacyName && !existsSync(join(target, 'main', NAME_FILE))) {
      await writeFile(join(target, 'main', NAME_FILE), JSON.stringify({ name: legacyName }))
    }
    await this.parkActive()
    for (const s of DIM_SUFFIXES) {
      if (existsSync(join(target, 'main' + s))) await rename(join(target, 'main' + s), join(this.serverDir, ln + s))
    }
    await rm(join(target, NAME_FILE), { force: true })
    await rmdir(target).catch(() => undefined)
  }

  /** Parks the current world and leaves room for the server to generate a new one on its next start. */
  async createNew(name: string): Promise<void> {
    const ln = await this.levelName()
    await this.parkActive()
    const dir = join(this.serverDir, ln)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, NAME_FILE), JSON.stringify({ name, createdAt: new Date().toISOString() }))
  }

  /** The folders that make up a world: its main folder plus any separate Nether/End folders. */
  async foldersOf(slot: string): Promise<{ dir: string; suffix: string }[]> {
    const ln = await this.levelName()
    const base = slot === ln && existsSync(join(this.serverDir, ln)) ? join(this.serverDir, ln) : join(this.storeDir, slot, 'main')
    if (!existsSync(join(base, 'level.dat'))) throw new Error('That world hasn’t been created yet.')
    return DIM_SUFFIXES.map((s) => ({ dir: base + s, suffix: s })).filter((f) => existsSync(f.dir))
  }

  /** Moves an inactive world to the Recycle Bin. */
  async remove(slot: string): Promise<void> {
    const dir = join(this.storeDir, slot)
    if (!existsSync(dir)) return
    await shell.trashItem(dir)
  }
}
