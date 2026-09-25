import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import type { BackupKind, BackupSchedule, BackupsView, RestoreMode } from '@shared/backups'
import type { NewWorldOptions } from '@shared/imports'
import type { ServerStatus, ServerSummary } from '@shared/servers'
import type { ServerManager } from '../servers/manager'
import type { TaskContext, TaskManager } from '../tasks'
import { logger } from '../log'
import { BackupStore, infoOf, type Manifest } from './store'

const log = logger('backups')

interface Deps {
  servers: ServerManager
  tasks: TaskManager
  /** True once the app is quitting: servers stopping then shouldn't start new backups. */
  isQuitting: () => boolean
}

/**
 * Runs backups for every server (SPEC §5): on a timer while people play, when a server
 * stops, whenever the user asks, and as a safety net before restores and world switches.
 * Work on one server runs one job at a time, and the server can't start mid-job.
 */
export class BackupManager extends EventEmitter<{ changed: [serverId: string] }> {
  private readonly timers = new Map<string, NodeJS.Timeout>()
  /** Someone was online since the last backup, so there's something worth saving. */
  private readonly played = new Map<string, boolean>()
  private readonly lastStatus = new Map<string, ServerStatus>()
  private readonly lastPlayers = new Map<string, number>()
  private readonly jobs = new Map<string, Promise<unknown>>()
  /** Servers whose files are being replaced right now; starting them must wait. */
  private readonly restoring = new Set<string>()

  constructor(private readonly deps: Deps) {
    super()
    deps.servers.on('changed', (s) => this.onServerChanged(s))
    deps.servers.on('removed', (id) => this.clearTimer(id))
    deps.servers.addStartGate((id) => this.beforeStart(id))
  }

  store(id: string): BackupStore {
    return new BackupStore(this.dirFor(id, this.deps.servers.backupSchedule(id).location))
  }

  private dirFor(id: string, location: string | null): string {
    return location ? join(location, id) : join(this.deps.servers.rootDir(id), 'backups')
  }

  async view(id: string): Promise<BackupsView> {
    const store = this.store(id)
    return {
      schedule: this.deps.servers.backupSchedule(id),
      backups: (await store.list()).map(infoOf),
      diskBytes: await store.diskBytes(),
      location: store.dir,
      running: this.jobs.has(id)
    }
  }

  // ------------------------------------------------------------ jobs

  /** One job at a time per server; later requests wait their turn. */
  private queue<T>(id: string, job: () => Promise<T>): Promise<T> {
    const prev = this.jobs.get(id) ?? Promise.resolve()
    const next = prev.then(job, job)
    this.jobs.set(id, next)
    this.emit('changed', id)
    next
      .finally(() => {
        if (this.jobs.get(id) === next) this.jobs.delete(id)
        this.emit('changed', id)
      })
      .catch(() => undefined)
    return next
  }

  /** A visible task that runs as one of this server's queued jobs. */
  private task<T>(id: string, title: string, work: (ctx: TaskContext) => Promise<T>): { taskId: string; result: Promise<T> } {
    const { id: taskId, result } = this.deps.tasks.run(title, (ctx) => this.queue(id, () => work(ctx)))
    result.catch((err: Error) => log.warn(`${title} failed: ${err.message}`))
    return { taskId, result }
  }

  private async beforeStart(id: string): Promise<void> {
    if (this.restoring.has(id)) throw new Error('A backup is being restored. Start the server when it has finished.')
    const job = this.jobs.get(id)
    if (!job) return
    this.deps.servers.appNote(id, 'Waiting for the backup to finish before starting…')
    await job.catch(() => undefined)
    if (this.restoring.has(id)) throw new Error('A backup is being restored. Start the server when it has finished.')
  }

  /** Takes one backup. Only call from inside a queued job. */
  private async snapshot(id: string, kind: BackupKind, reason: string, ctx: TaskContext): Promise<Manifest> {
    const { levelName, worldName } = await this.deps.servers.activeLevel(id)
    const store = this.store(id)
    const manifest = await this.deps.servers.withSavesPaused(id, () =>
      store.create(
        this.deps.servers.rootDir(id),
        { kind, reason, config: this.deps.servers.get(id).config, levelName, worldName },
        ctx
      )
    )
    if (kind === 'auto' || kind === 'safety') await store.prune(this.deps.servers.backupSchedule(id).keep)
    log.info(`backup ${manifest.id} of ${id} (${kind}): ${manifest.files.length} files, ${manifest.newBytes} new bytes`)
    return manifest
  }

  private backup(id: string, kind: BackupKind, reason: string): string {
    const name = this.deps.servers.get(id).config.name
    return this.task(id, `Backing up ${name}`, (ctx) => this.snapshot(id, kind, reason, ctx)).taskId
  }

  /** "Back up now". Works whether the server is running or not. */
  backupNow(id: string): string {
    this.played.set(id, this.deps.servers.get(id).players.length > 0)
    return this.backup(id, 'manual', 'Backed up by you')
  }

  // ------------------------------------------------------------ schedule

  private onServerChanged(s: ServerSummary): void {
    const id = s.config.id
    const before = this.lastPlayers.get(id) ?? 0
    this.lastPlayers.set(id, s.players.length)
    if (s.players.length > 0) this.played.set(id, true)
    // The last player just left: save right away instead of waiting for the server to stop.
    if (
      s.status === 'running' && before > 0 && s.players.length === 0 &&
      this.deps.servers.backupSchedule(id).onEmpty && this.played.get(id) && !this.jobs.has(id)
    ) {
      this.played.set(id, false)
      this.backup(id, 'auto', 'Everyone left')
    }
    const prev = this.lastStatus.get(id)
    this.lastStatus.set(id, s.status)
    if (prev === s.status) return
    if (s.status === 'running') this.startTimer(id)
    else this.clearTimer(id)
    // Clean stops only: right after a crash the files may be half-written, and the
    // server is about to restart on its own anyway.
    if (s.status === 'stopped' && (prev === 'running' || prev === 'stopping')) {
      if (this.deps.servers.backupSchedule(id).onStop && this.played.get(id) && !this.deps.isQuitting()) {
        this.played.set(id, false)
        this.backup(id, 'auto', 'Server stopped')
      }
    }
  }

  private startTimer(id: string): void {
    this.clearTimer(id)
    const minutes = this.deps.servers.backupSchedule(id).intervalMinutes
    if (!minutes) return
    this.timers.set(
      id,
      setInterval(() => {
        if (!this.played.get(id) || this.jobs.has(id)) return
        // Players still online mean there'll be more to save next time too.
        this.played.set(id, this.deps.servers.get(id).players.length > 0)
        this.backup(id, 'auto', `Every ${minutes} minutes`)
      }, minutes * 60_000)
    )
  }

  private clearTimer(id: string): void {
    const t = this.timers.get(id)
    if (t) clearInterval(t)
    this.timers.delete(id)
  }

  /** Changes when backups happen. Returns a task id when backups have to be moved. */
  async setSchedule(id: string, patch: Partial<BackupSchedule>): Promise<string | null> {
    const current = this.deps.servers.backupSchedule(id)
    const next: BackupSchedule = { ...current }
    if (patch.intervalMinutes !== undefined) {
      next.intervalMinutes =
        patch.intervalMinutes === null ? null : Math.min(24 * 60, Math.max(5, Math.round(patch.intervalMinutes)))
    }
    if (patch.onEmpty !== undefined) next.onEmpty = !!patch.onEmpty
    if (patch.onStop !== undefined) next.onStop = !!patch.onStop
    if (patch.keep !== undefined) next.keep = Math.min(100, Math.max(1, Math.round(patch.keep)))

    const moving = patch.location !== undefined && (patch.location || null) !== current.location
    if (!moving) {
      await this.deps.servers.setBackupSchedule(id, next)
      if (next.intervalMinutes !== current.intervalMinutes && this.deps.servers.get(id).status === 'running') {
        this.startTimer(id)
      }
      this.emit('changed', id)
      return null
    }
    next.location = patch.location || null
    const to = this.dirFor(id, next.location)
    return this.task(id, 'Moving backups', async (ctx) => {
      ctx.step('Copying backups to the new folder')
      await this.store(id).moveTo(to, ctx)
      await this.deps.servers.setBackupSchedule(id, next)
    }).taskId
  }

  // ------------------------------------------------------------ managing backups

  async setProtected(id: string, backupId: string, value: boolean): Promise<void> {
    await this.queue(id, () => this.store(id).setProtected(backupId, value))
  }

  async delete(id: string, backupId: string): Promise<void> {
    await this.queue(id, () => this.store(id).delete(backupId))
  }

  /** Puts the server (or just its world) back the way it was. A safety backup comes first. */
  async restore(id: string, backupId: string, mode: RestoreMode): Promise<string> {
    if (this.deps.servers.isLive(id)) throw new Error('Stop the server before restoring a backup.')
    const target = await this.store(id).get(backupId)
    const when = new Date(target.createdAt).toLocaleString()
    if (this.restoring.has(id)) throw new Error('A backup is already being restored.')
    // Marked before the job is queued, so a Start clicked right now is turned away too.
    this.restoring.add(id)
    return this.task(id, 'Restoring a backup', async (ctx) => {
      try {
        if (this.deps.servers.isLive(id)) throw new Error('Stop the server before restoring a backup.')
        ctx.step('Taking a safety backup first')
        await this.snapshot(id, 'safety', `Before restoring the backup from ${when}`, ctx)
        await this.store(id).restore(backupId, this.deps.servers.rootDir(id), mode, ctx)
        if (mode === 'server') await this.deps.servers.restoreSoftware(id, target.config)
        this.deps.servers.appNote(
          id,
          mode === 'server'
            ? `Restored the whole server from the backup of ${when}. A safety backup of how it was just before is in Backups.`
            : `Restored the world from the backup of ${when}. A safety backup of how it was just before is in Backups.`
        )
        this.deps.servers.worldsChanged(id)
      } finally {
        this.restoring.delete(id)
      }
    }).taskId
  }

  /** Switching worlds moves folders around, so a safety backup comes first (SPEC §5). */
  switchWorld(id: string, slot: string): Promise<void> {
    if (this.deps.servers.isLive(id)) throw new Error('Stop the server before switching worlds.')
    // A Start clicked meanwhile waits for this job, then loads the new world.
    return this.task(id, 'Switching worlds', async (ctx) => {
      ctx.step('Taking a safety backup first')
      await this.snapshot(id, 'safety', 'Before switching worlds', ctx)
      ctx.step('Switching worlds')
      await this.deps.servers.activateWorld(id, slot)
    }).result
  }

  /** A new world parks the current one, so a safety backup comes first too. */
  newWorld(id: string, name: string, seed: string, options: NewWorldOptions = {}): Promise<void> {
    if (this.deps.servers.isLive(id)) throw new Error('Stop the server before making a new world.')
    return this.task(id, 'Making a new world', async (ctx) => {
      ctx.step('Taking a safety backup first')
      await this.snapshot(id, 'safety', 'Before making a new world', ctx)
      await this.deps.servers.newWorld(id, name, seed, options)
    }).result
  }

  /** Saves a backup as a normal .zip wherever the user picks. Null when they cancel. */
  async exportZip(id: string, backupId: string): Promise<string | null> {
    const m = await this.store(id).get(backupId)
    const stamp = m.createdAt.slice(0, 16).replace('T', ' ').replace(':', '-')
    const safeName = this.deps.servers.get(id).config.name.replace(/[<>:"/\\|?*]+/g, '')
    const opts = {
      title: 'Save backup as .zip',
      defaultPath: `${safeName} backup ${stamp}.zip`,
      filters: [{ name: 'Zip', extensions: ['zip'] }]
    }
    const win = BrowserWindow.getFocusedWindow()
    const pick = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (pick.canceled || !pick.filePath) return null
    const dest = pick.filePath
    return this.task(id, 'Exporting a backup', async (ctx) => {
      ctx.step('Writing the .zip')
      await this.store(id).exportZip(backupId, dest, ctx)
    }).taskId
  }

  /** On quit: no new backups; give one that's already running a moment to finish. */
  async shutdown(): Promise<void> {
    for (const id of [...this.timers.keys()]) this.clearTimer(id)
    await Promise.allSettled([...this.jobs.values()])
  }
}
