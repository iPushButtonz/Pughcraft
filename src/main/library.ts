import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, statfs } from 'node:fs/promises'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { app } from 'electron'
import { APP_NAME } from '@shared/brand'
import type { LibraryCheck, LibraryInfo } from '@shared/ipc'
import { copyDir, dirSize } from './core/fsutil'
import { dataRoot, isDefaultLibrary, libraryRoot, setLibraryPointer } from './paths'
import type { ServerManager } from './servers/manager'
import type { TaskContext, TaskManager } from './tasks'
import { logger } from './log'

const log = logger('library')

/** What makes up the library. Settings, logs and the playit link stay with the app data. */
const PARTS = ['servers', 'java', 'cache', 'tools']

/** Cloud-synced folders corrupt running worlds (SPEC §3), so moving into one gets a warning. */
export function isCloudFolder(dir: string): boolean {
  const p = resolve(dir).toLowerCase()
  const roots = [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial]
    .filter((r): r is string => !!r)
    .map((r) => resolve(r).toLowerCase())
  if (roots.some((r) => p === r || p.startsWith(r + '\\') || p.startsWith(r + '/'))) return true
  return /[\\/](onedrive|dropbox|google ?drive|googledrive|my drive|icloud ?drive|proton ?drive|mega|box)([\\/ -]|$)/i.test(p)
}

export class LibraryService {
  constructor(private readonly deps: { servers: ServerManager; tasks: TaskManager; busy: () => boolean }) {}

  async info(): Promise<LibraryInfo> {
    const path = libraryRoot()
    return { path, isDefault: isDefaultLibrary(path), cloud: isCloudFolder(path) }
  }

  /** Where a move to `chosen` would put the library, and whether that's a good idea. */
  async check(chosen: string): Promise<LibraryCheck> {
    const target = await this.targetFor(chosen)
    const current = libraryRoot()
    const rel = relative(current, target)
    const inside = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
    let freeBytes: number | null = null
    try {
      // The folder may not exist yet; its nearest existing parent is on the same drive.
      let probe = target
      while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe)
      const s = await statfs(probe)
      freeBytes = Number(s.bavail) * Number(s.bsize)
    } catch {
      freeBytes = null
    }
    let neededBytes = 0
    for (const part of PARTS) neededBytes += await dirSize(join(current, part))
    return {
      target,
      cloud: isCloudFolder(target),
      same: resolve(target) === resolve(current),
      inside: inside && resolve(target) !== resolve(current),
      freeBytes,
      neededBytes
    }
  }

  /** A folder with other things in it gets a "Pughcraft" subfolder, so our files don't mix with them. */
  private async targetFor(chosen: string): Promise<string> {
    if (isDefaultLibrary(chosen)) return dataRoot()
    if (!existsSync(chosen)) return chosen
    const entries = (await readdir(chosen)).filter((n) => !PARTS.includes(n))
    return entries.length ? join(chosen, APP_NAME) : chosen
  }

  /** Copies the library to a new folder, points the app at it, removes the old copy and restarts. */
  move(chosen: string): string {
    if (this.deps.servers.runningCount() > 0) throw new Error('Stop every server before moving the library.')
    if (this.deps.busy()) throw new Error('Wait for the current backup or download to finish first.')
    const { id, result } = this.deps.tasks.run(
      'Moving the library',
      async (ctx: TaskContext) => {
        const check = await this.check(chosen)
        if (check.same) throw new Error('The library is already there.')
        if (check.inside) throw new Error('The library can’t move into its own folder.')
        if (check.freeBytes !== null && check.freeBytes < check.neededBytes * 1.05) {
          throw new Error('There isn’t enough free space there.')
        }
        const from = libraryRoot()
        const to = check.target
        await mkdir(to, { recursive: true })
        for (const part of PARTS) {
          if (existsSync(join(from, part)) && existsSync(join(to, part))) {
            throw new Error(`The new folder already has a "${part}" folder. Pick an empty folder.`)
          }
        }
        let done = 0
        const copied: string[] = []
        try {
          for (const part of PARTS) {
            const src = join(from, part)
            if (!existsSync(src)) continue
            ctx.step(`Copying ${part}`)
            const before = done
            copied.push(join(to, part))
            await copyDir(src, join(to, part), {
              signal: ctx.signal,
              onProgress: (d) => {
                done = before + d
                ctx.bytes(done, check.neededBytes)
              }
            })
          }
        } catch (err) {
          // Leave nothing half-copied behind; the library stays where it was.
          for (const dir of copied) await rm(dir, { recursive: true, force: true }).catch(() => undefined)
          throw err
        }
        ctx.step('Switching over')
        await setLibraryPointer(to)
        // Only now that the new copy is complete and in use is the old one removed.
        ctx.step('Removing the old copy')
        for (const part of PARTS) await rm(join(from, part), { recursive: true, force: true }).catch((err) => log.warn(`could not remove old ${part}`, err))
        log.info(`library moved from ${from} to ${to}`)
      },
      { cancellable: true }
    )
    result.then(
      () =>
        setTimeout(() => {
          // A dev build can't relaunch itself (its UI comes from the dev server), so it just quits.
          if (app.isPackaged) app.relaunch()
          app.exit(0)
        }, 1500),
      () => undefined
    )
    return id
  }
}
