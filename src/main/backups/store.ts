import { createHash, randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import yazl from 'yazl'
import type { BackupInfo, BackupKind } from '@shared/backups'
import type { ServerConfig } from '@shared/servers'
import type { TaskContext } from '../tasks'
import { copyDir, dirSize } from '../core/fsutil'

/**
 * Smart snapshots (SPEC §5): every file is stored once under its SHA-256 in `objects/`;
 * each backup is a small manifest listing paths → hashes. A backup only adds files that
 * changed, yet each one restores on its own. Deleting a backup never touches files other
 * backups still use.
 */

export interface ManifestFile {
  /** Path relative to the server's root folder, always with "/" separators. */
  p: string
  h: string
  s: number
  m: number
}

export interface Manifest {
  version: 1
  id: string
  kind: BackupKind
  reason: string
  createdAt: string
  protected: boolean
  config: ServerConfig
  /** Folder of the active world inside `server/`, for world-only restores. */
  levelName: string
  worldName: string | null
  newBytes: number
  files: ManifestFile[]
}

export const infoOf = (m: Manifest): BackupInfo => ({
  id: m.id,
  kind: m.kind,
  reason: m.reason,
  createdAt: m.createdAt,
  protected: m.protected,
  mcVersion: m.config.mcVersion,
  totalBytes: m.files.reduce((n, f) => n + f.s, 0),
  newBytes: m.newBytes,
  fileCount: m.files.length,
  worldName: m.worldName
})

/** Folders not worth backing up: logs, caches and files the server rebuilds. */
const SKIP = [
  /^server\/logs(\/|$)/,
  /^server\/crash-reports(\/|$)/,
  /^server\/cache(\/|$)/,
  /^server\/\.fabric(\/|$)/,
  /^server\/debug(\/|$)/,
  /(^|\/)session\.lock$/,
  /\.log(\.gz)?$/
]

const posix = (p: string): string => p.split(sep).join('/')

/** Removes `dir` and then its parents while they're empty, stopping below `root/server` and `root/worlds`. */
async function removeEmptyUpTo(dir: string, root: string): Promise<void> {
  const stops = new Set([root, join(root, 'server'), join(root, 'worlds')])
  let current = dir
  while (!stops.has(current) && current.startsWith(root)) {
    try {
      await rmdir(current) // only succeeds when empty
    } catch {
      return
    }
    current = dirname(current)
  }
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

export class BackupStore {
  constructor(readonly dir: string) {}

  private get objects(): string {
    return join(this.dir, 'objects')
  }
  private get snapshots(): string {
    return join(this.dir, 'snapshots')
  }
  private objectPath(hash: string): string {
    return join(this.objects, hash.slice(0, 2), hash)
  }

  async list(): Promise<Manifest[]> {
    if (!existsSync(this.snapshots)) return []
    const out: Manifest[] = []
    for (const name of await readdir(this.snapshots)) {
      if (!name.endsWith('.json')) continue
      try {
        out.push(JSON.parse(await readFile(join(this.snapshots, name), 'utf8')) as Manifest)
      } catch {
        // A damaged manifest is skipped rather than breaking the list.
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async get(id: string): Promise<Manifest> {
    const m = JSON.parse(await readFile(join(this.snapshots, `${id}.json`), 'utf8')) as Manifest
    return m
  }

  private async saveManifest(m: Manifest): Promise<void> {
    await mkdir(this.snapshots, { recursive: true })
    const file = join(this.snapshots, `${m.id}.json`)
    await writeFile(`${file}.tmp`, JSON.stringify(m))
    await rename(`${file}.tmp`, file)
  }

  /** Files under `root` that belong in a backup, with their size and change time. */
  private async collect(root: string, prefixes: string[]): Promise<{ rel: string; abs: string; size: number; mtime: number }[]> {
    const out: { rel: string; abs: string; size: number; mtime: number }[] = []
    const walk = async (abs: string): Promise<void> => {
      let entries
      try {
        entries = await readdir(abs, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of entries) {
        const full = join(abs, e.name)
        const rel = posix(relative(root, full))
        if (SKIP.some((re) => re.test(rel))) continue
        if (e.isDirectory()) await walk(full)
        else if (e.isFile()) {
          const st = await stat(full)
          out.push({ rel, abs: full, size: st.size, mtime: st.mtimeMs })
        }
      }
    }
    for (const p of prefixes) await walk(join(root, p))
    return out
  }

  /**
   * Makes a new backup of `root/server` and `root/worlds`. Files whose size and change time
   * match the previous backup reuse its hash, so unchanged worlds back up in seconds.
   */
  async create(
    root: string,
    meta: { kind: BackupKind; reason: string; config: ServerConfig; levelName: string; worldName: string | null },
    ctx: TaskContext
  ): Promise<Manifest> {
    ctx.step('Looking for changed files')
    const files = await this.collect(root, ['server', 'worlds'])
    const previous = (await this.list())[0]
    const known = new Map(previous?.files.map((f) => [f.p, f]) ?? [])
    const total = files.reduce((n, f) => n + f.size, 0)
    let done = 0
    let newBytes = 0
    const entries: ManifestFile[] = []
    ctx.step('Backing up')
    for (const f of files) {
      ctx.throwIfCancelled()
      const prev = known.get(f.rel)
      const hash = prev && prev.s === f.size && prev.m === f.mtime ? prev.h : await sha256(f.abs)
      const obj = this.objectPath(hash)
      if (!existsSync(obj)) {
        await mkdir(dirname(obj), { recursive: true })
        await copyFile(f.abs, `${obj}.part`)
        await rename(`${obj}.part`, obj)
        newBytes += f.size
      }
      entries.push({ p: f.rel, h: hash, s: f.size, m: f.mtime })
      done += f.size
      ctx.bytes(done, total)
    }
    const manifest: Manifest = {
      version: 1,
      id: `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(2).toString('hex')}`,
      createdAt: new Date().toISOString(),
      protected: false,
      newBytes,
      files: entries,
      ...meta
    }
    await this.saveManifest(manifest)
    return manifest
  }

  async setProtected(id: string, value: boolean): Promise<void> {
    const m = await this.get(id)
    m.protected = value
    await this.saveManifest(m)
  }

  async delete(id: string): Promise<void> {
    await rm(join(this.snapshots, `${id}.json`), { force: true })
    await this.collectGarbage()
  }

  /**
   * Retention: keep the newest `keep` automatic backups and safety backups younger than
   * 14 days. Manual and protected backups are never removed here.
   */
  async prune(keep: number): Promise<number> {
    const all = await this.list()
    const doomed: Manifest[] = []
    const autos = all.filter((m) => m.kind === 'auto' && !m.protected)
    doomed.push(...autos.slice(Math.max(0, keep)))
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
    doomed.push(...all.filter((m) => m.kind === 'safety' && !m.protected && Date.parse(m.createdAt) < cutoff))
    for (const m of doomed) await rm(join(this.snapshots, `${m.id}.json`), { force: true })
    if (doomed.length) await this.collectGarbage()
    return doomed.length
  }

  /** Removes stored files no backup refers to any more. */
  async collectGarbage(): Promise<void> {
    const used = new Set((await this.list()).flatMap((m) => m.files.map((f) => f.h)))
    if (!existsSync(this.objects)) return
    for (const bucket of await readdir(this.objects)) {
      const dir = join(this.objects, bucket)
      for (const name of await readdir(dir)) {
        if (!used.has(name)) await unlink(join(dir, name)).catch(() => undefined)
      }
    }
  }

  diskBytes(): Promise<number> {
    return dirSize(this.dir)
  }

  /**
   * Puts `root` back the way it was in backup `id`. 'server' restores everything the backup
   * covers (and removes files added since); 'world' only touches the active world's folders.
   */
  async restore(id: string, root: string, mode: 'server' | 'world', ctx: TaskContext): Promise<Manifest> {
    const m = await this.get(id)
    const inScope =
      mode === 'server'
        ? (rel: string): boolean => rel.startsWith('server/') || rel.startsWith('worlds/')
        : (rel: string): boolean =>
            [m.levelName, `${m.levelName}_nether`, `${m.levelName}_the_end`].some(
              (w) => rel.startsWith(`server/${w}/`)
            )
    const wanted = m.files.filter((f) => inScope(f.p))
    const wantedPaths = new Set(wanted.map((f) => f.p))
    ctx.step('Removing files added since the backup')
    const current = await this.collect(root, mode === 'server' ? ['server', 'worlds'] : ['server'])
    const emptied = new Set<string>()
    for (const f of current) {
      if (inScope(f.rel) && !wantedPaths.has(f.rel)) {
        await unlink(f.abs).catch(() => undefined)
        emptied.add(dirname(f.abs))
      }
    }
    // Folders that only held those files go too; empty folders the user made are left alone.
    for (const dir of emptied) await removeEmptyUpTo(dir, root)
    if (mode === 'server') {
      // World slots added since the backup may still hold files backups skip (logs,
      // session.lock). They weren't there back then, so they go entirely.
      const slots = new Set(m.files.filter((f) => f.p.startsWith('worlds/')).map((f) => f.p.split('/')[1]))
      const worldsDir = join(root, 'worlds')
      for (const slot of existsSync(worldsDir) ? await readdir(worldsDir) : []) {
        if (!slots.has(slot)) await rm(join(worldsDir, slot), { recursive: true, force: true })
      }
    }
    ctx.step('Restoring files')
    const currentByPath = new Map(current.map((f) => [f.rel, f]))
    const total = wanted.reduce((n, f) => n + f.s, 0)
    let done = 0
    for (const f of wanted) {
      ctx.throwIfCancelled()
      const cur = currentByPath.get(f.p)
      // Skip files that are already exactly right.
      if (!(cur && cur.size === f.s && cur.mtime === f.m)) {
        const obj = this.objectPath(f.h)
        if (!existsSync(obj)) throw new Error(`The backup is missing a file (${f.p}). It may have been damaged.`)
        const target = join(root, ...f.p.split('/'))
        await mkdir(dirname(target), { recursive: true })
        await copyFile(obj, target)
      }
      done += f.s
      ctx.bytes(done, total)
    }
    return m
  }

  /** Writes a normal .zip of backup `id` that opens anywhere. */
  async exportZip(id: string, dest: string, ctx: TaskContext): Promise<void> {
    const m = await this.get(id)
    const zip = new yazl.ZipFile()
    for (const f of m.files) {
      zip.addFile(this.objectPath(f.h), f.p, { mtime: new Date(f.m) })
    }
    zip.end()
    const total = m.files.reduce((n, f) => n + f.s, 0)
    let done = 0
    zip.outputStream.on('data', (chunk: Buffer) => {
      done += chunk.length
      ctx.bytes(Math.min(done, total), total)
    })
    await pipeline(zip.outputStream, createWriteStream(`${dest}.part`), { signal: ctx.signal })
    await rename(`${dest}.part`, dest)
  }

  /** Moves every backup to another folder (e.g. another drive). */
  async moveTo(newDir: string, ctx: TaskContext): Promise<void> {
    const rel = relative(this.dir, newDir)
    if (rel === '' || (!rel.startsWith('..') && !/^[A-Za-z]:/.test(rel))) {
      throw new Error("Backups can't be moved into their own folder. Pick a different one.")
    }
    if (!existsSync(this.dir)) return
    await copyDir(this.dir, newDir, { signal: ctx.signal, onProgress: (d, t) => ctx.bytes(d, t) })
    await rm(this.dir, { recursive: true, force: true })
  }
}
