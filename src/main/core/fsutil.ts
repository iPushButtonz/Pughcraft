import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Total size of a folder in bytes (0 if it doesn't exist). */
export async function dirSize(path: string): Promise<number> {
  let total = 0
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const p = join(path, e.name)
    if (e.isDirectory()) total += await dirSize(p)
    else if (e.isFile()) total += (await stat(p)).size
  }
  return total
}

export interface CopyOptions {
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
  /** Return false to skip a file or folder (path is relative to the source). */
  filter?: (relPath: string, isDir: boolean) => boolean
}

/** Copies a folder tree, reporting progress by bytes. Existing files are overwritten. */
export async function copyDir(src: string, dest: string, opts: CopyOptions = {}): Promise<void> {
  const files: { rel: string; size: number }[] = []
  const walk = async (rel: string): Promise<void> => {
    for (const e of await readdir(join(src, rel), { withFileTypes: true })) {
      const r = rel ? join(rel, e.name) : e.name
      if (opts.filter && !opts.filter(r, e.isDirectory())) continue
      if (e.isDirectory()) await walk(r)
      else if (e.isFile()) files.push({ rel: r, size: (await stat(join(src, r))).size })
    }
  }
  await walk('')
  const total = files.reduce((n, f) => n + f.size, 0)
  let done = 0
  await mkdir(dest, { recursive: true })
  const made = new Set<string>()
  for (const f of files) {
    if (opts.signal?.aborted) throw new Error('Cancelled')
    const target = join(dest, f.rel)
    const parent = join(target, '..')
    if (!made.has(parent)) {
      await mkdir(parent, { recursive: true })
      made.add(parent)
    }
    await copyFile(join(src, f.rel), target)
    done += f.size
    opts.onProgress?.(done, total)
  }
}

/** Moves a folder; renames when possible, otherwise copies then deletes (other drive). */
export async function moveDir(src: string, dest: string, opts: CopyOptions = {}): Promise<void> {
  await mkdir(join(dest, '..'), { recursive: true })
  try {
    await rename(src, dest)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await copyDir(src, dest, opts)
    await rm(src, { recursive: true, force: true })
  }
}
