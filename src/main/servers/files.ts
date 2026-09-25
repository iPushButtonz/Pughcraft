import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, normalize, relative, sep } from 'node:path'
import { shell } from 'electron'
import type { FileContent, FileEntry } from '@shared/players'
import type { SettingsStore } from '../settings'
import type { TaskContext } from '../tasks'
import { copyDir } from '../core/fsutil'
import type { ServerManager } from './manager'

/** Bigger files open read-only elsewhere (world regions, logs). */
const MAX_EDIT_BYTES = 2 * 1024 * 1024
const BAD_NAME = /[<>:"/\\|?*\x00-\x1f]|^\.\.?$/

const posix = (p: string): string => p.split(sep).join('/')

/**
 * The Files tab (Advanced): browse and edit the real files of one server, never anything
 * outside its folder.
 */
export class FileService {
  constructor(
    private readonly servers: ServerManager,
    private readonly settings: SettingsStore
  ) {}

  /** Resolves a path inside the server folder, refusing anything that escapes it (including via links). */
  private async resolve(id: string, rel: string): Promise<{ root: string; abs: string }> {
    const root = this.servers.serverDir(id)
    const clean = normalize(rel.replace(/\\/g, '/')).replace(/^([/\\])+/, '')
    const abs = join(root, clean)
    const r = relative(root, abs)
    if (r.startsWith('..') || isAbsolute(r)) throw new Error('That file is outside this server’s folder.')
    if (existsSync(abs)) {
      const [realRoot, realAbs] = await Promise.all([realpath(root), realpath(abs)])
      const rr = relative(realRoot, realAbs)
      if (rr.startsWith('..') || isAbsolute(rr)) throw new Error('That file is outside this server’s folder.')
    }
    return { root, abs }
  }

  private checkWritable(id: string): void {
    const live = this.servers.isLive(id)
    if (live && !this.settings.get().editFilesWhileRunning) {
      throw new Error('Editing files while the server runs is turned off in Settings. Stop the server first.')
    }
  }

  async list(id: string, rel: string): Promise<FileEntry[]> {
    const { root, abs } = await this.resolve(id, rel)
    const out: FileEntry[] = []
    for (const d of await readdir(abs, { withFileTypes: true })) {
      const full = join(abs, d.name)
      try {
        const st = await stat(full)
        out.push({
          name: d.name,
          path: posix(relative(root, full)),
          dir: st.isDirectory(),
          size: st.isDirectory() ? 0 : st.size,
          modified: st.mtime.toISOString()
        })
      } catch {
        // Vanished or locked while listing; skip it.
      }
    }
    return out.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.dir ? -1 : 1))
  }

  async read(id: string, rel: string): Promise<FileContent> {
    const { abs } = await this.resolve(id, rel)
    const st = await stat(abs)
    if (st.isDirectory()) throw new Error('That’s a folder.')
    const base = { path: posix(rel), size: st.size }
    if (st.size > MAX_EDIT_BYTES) return { ...base, text: null, reason: 'This file is too big to edit here (over 2 MB). Open the folder to use another program.' }
    const data = await readFile(abs)
    if (data.subarray(0, 8192).includes(0)) {
      return { ...base, text: null, reason: 'This isn’t a text file, so it can’t be edited here.' }
    }
    return { ...base, text: data.toString('utf8'), reason: null }
  }

  async write(id: string, rel: string, text: string): Promise<void> {
    this.checkWritable(id)
    const { abs } = await this.resolve(id, rel)
    if (Buffer.byteLength(text) > MAX_EDIT_BYTES) throw new Error('That’s too much text for one file here.')
    await writeFile(`${abs}.pughcraft-tmp`, text, 'utf8')
    await rename(`${abs}.pughcraft-tmp`, abs)
  }

  async mkdir(id: string, parentRel: string, name: string): Promise<void> {
    this.checkWritable(id)
    if (BAD_NAME.test(name.trim())) throw new Error('That name can’t be used for a folder.')
    const { abs } = await this.resolve(id, join(parentRel, name.trim()))
    await mkdir(abs, { recursive: false })
  }

  async rename(id: string, rel: string, newName: string): Promise<void> {
    this.checkWritable(id)
    if (BAD_NAME.test(newName.trim())) throw new Error('That name can’t be used.')
    const { root, abs } = await this.resolve(id, rel)
    if (abs === root) throw new Error('The server folder itself can’t be renamed.')
    const { abs: target } = await this.resolve(id, join(dirname(rel), newName.trim()))
    if (existsSync(target)) throw new Error('Something with that name is already there.')
    await rename(abs, target)
  }

  /** Moves a file or folder to the Recycle Bin (or the desktop's trash on Linux). */
  async trash(id: string, rel: string): Promise<void> {
    this.checkWritable(id)
    const { root, abs } = await this.resolve(id, rel)
    if (abs === root) throw new Error('The server folder itself can’t be deleted here.')
    await shell.trashItem(abs)
  }

  /** Copies files or folders from elsewhere on the PC into a folder of the server. */
  async importPaths(id: string, parentRel: string, sources: string[], ctx: TaskContext): Promise<void> {
    this.checkWritable(id)
    const { abs: dir } = await this.resolve(id, parentRel)
    for (const src of sources) {
      ctx.throwIfCancelled()
      const target = join(dir, basename(src))
      if (existsSync(target)) throw new Error(`“${basename(src)}” is already there. Rename or delete it first.`)
      const st = await stat(src)
      ctx.step(`Copying ${basename(src)}`)
      if (st.isDirectory()) await copyDir(src, target, { signal: ctx.signal, onProgress: (d, t) => ctx.bytes(d, t) })
      else await copyFile(src, target)
    }
  }

  async reveal(id: string, rel: string): Promise<void> {
    const { abs } = await this.resolve(id, rel)
    if (existsSync(abs) && (await stat(abs)).isDirectory()) await shell.openPath(abs)
    else shell.showItemInFolder(abs)
  }
}
