import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type { TaskSnapshot } from '@shared/tasks'
import { formatBytes } from '@shared/format'
import { logger } from './log'

const log = logger('tasks')

/** UI updates for a running task are sent at most this often. */
const THROTTLE_MS = 100
/** Finished tasks disappear from the UI on their own after this long; failures stay until dismissed. */
const DONE_LINGER_MS = 8000

export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancelledError'
  }
}

/** Handed to every task's work function so it can report progress and notice cancellation. */
export interface TaskContext {
  readonly signal: AbortSignal
  step(text: string): void
  /** `fraction` is 0..1, or null for "working, amount unknown". */
  progress(fraction: number | null, detail?: string | null): void
  /** Progress from byte counts, with a "12.1 MB of 80 MB" detail line. */
  bytes(done: number, total: number | null): void
  throwIfCancelled(): void
}

interface Entry {
  snap: TaskSnapshot
  controller: AbortController
  timer: NodeJS.Timeout | null
}

export class TaskManager extends EventEmitter<{ update: [TaskSnapshot]; remove: [string] }> {
  private readonly entries = new Map<string, Entry>()

  list(): TaskSnapshot[] {
    return [...this.entries.values()].map((e) => e.snap)
  }

  /** Starts `work` as a visible task. The returned promise settles with the work's result. */
  run<T>(
    title: string,
    work: (ctx: TaskContext) => Promise<T>,
    opts: { cancellable?: boolean } = {}
  ): { id: string; result: Promise<T> } {
    const id = randomUUID()
    const controller = new AbortController()
    const entry: Entry = {
      controller,
      timer: null,
      snap: {
        id,
        title,
        status: 'running',
        step: null,
        progress: null,
        detail: null,
        error: null,
        cancellable: opts.cancellable ?? true,
        startedAt: Date.now(),
        endedAt: null
      }
    }
    this.entries.set(id, entry)
    this.emit('update', { ...entry.snap })

    const change = (patch: Partial<TaskSnapshot>): void => {
      if (entry.snap.status !== 'running') return
      entry.snap = { ...entry.snap, ...patch }
      this.scheduleEmit(entry)
    }
    const ctx: TaskContext = {
      signal: controller.signal,
      step: (text) => change({ step: text, progress: null, detail: null }),
      progress: (fraction, detail) =>
        change({
          progress: fraction === null ? null : Math.min(1, Math.max(0, fraction)),
          ...(detail !== undefined ? { detail } : {})
        }),
      bytes: (done, total) =>
        change({
          progress: total ? Math.min(1, done / total) : null,
          detail: total ? `${formatBytes(done)} of ${formatBytes(total)}` : formatBytes(done)
        }),
      throwIfCancelled: () => {
        if (controller.signal.aborted) throw new CancelledError()
      }
    }

    const result = (async () => {
      try {
        const value = await work(ctx)
        this.finish(entry, { status: 'done', progress: 1 })
        return value
      } catch (err) {
        if (controller.signal.aborted) {
          this.finish(entry, { status: 'cancelled' })
        } else {
          log.error(`task "${title}" failed`, err)
          this.finish(entry, {
            status: 'failed',
            error: err instanceof Error ? err.message : String(err)
          })
        }
        throw err
      }
    })()
    // Callers that fire-and-forget still get failures logged above, never an unhandled rejection.
    result.catch(() => undefined)
    return { id, result }
  }

  cancel(id: string): void {
    const entry = this.entries.get(id)
    if (entry && entry.snap.status === 'running' && entry.snap.cancellable) {
      entry.controller.abort()
    }
  }

  dismiss(id: string): void {
    const entry = this.entries.get(id)
    if (!entry || entry.snap.status === 'running') return
    if (entry.timer) clearTimeout(entry.timer)
    this.entries.delete(id)
    this.emit('remove', id)
  }

  private scheduleEmit(entry: Entry): void {
    if (entry.timer) return
    entry.timer = setTimeout(() => {
      entry.timer = null
      this.emit('update', { ...entry.snap })
    }, THROTTLE_MS)
  }

  private finish(entry: Entry, patch: Partial<TaskSnapshot>): void {
    if (entry.timer) clearTimeout(entry.timer)
    entry.timer = null
    entry.snap = { ...entry.snap, ...patch, endedAt: Date.now() }
    this.emit('update', { ...entry.snap })
    if (entry.snap.status === 'done' || entry.snap.status === 'cancelled') {
      entry.timer = setTimeout(() => this.dismiss(entry.snap.id), DONE_LINGER_MS)
    }
  }
}
