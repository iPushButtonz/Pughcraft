import { describe, expect, it, vi } from 'vitest'
import type { TaskSnapshot } from '@shared/tasks'

vi.mock('./log', () => ({
  logger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined })
}))

const { TaskManager } = await import('./tasks')

function lastUpdate(updates: TaskSnapshot[]): TaskSnapshot {
  return updates[updates.length - 1]
}

describe('TaskManager', () => {
  it('reports progress and completes', async () => {
    const tasks = new TaskManager()
    const updates: TaskSnapshot[] = []
    tasks.on('update', (s) => updates.push(s))

    const { result } = tasks.run('Download', async (ctx) => {
      ctx.step('Downloading')
      ctx.bytes(512, 1024)
      await new Promise((r) => setTimeout(r, 150))
      return 42
    })

    await expect(result).resolves.toBe(42)
    expect(updates.some((u) => u.step === 'Downloading' && u.progress === 0.5)).toBe(true)
    expect(updates.some((u) => u.detail === '512 B of 1.0 KB')).toBe(true)
    expect(lastUpdate(updates)).toMatchObject({ status: 'done', progress: 1 })
  })

  it('marks failures with the error message', async () => {
    const tasks = new TaskManager()
    const updates: TaskSnapshot[] = []
    tasks.on('update', (s) => updates.push(s))

    const { result } = tasks.run('Install', async () => {
      throw new Error('disk full')
    })

    await expect(result).rejects.toThrow('disk full')
    expect(lastUpdate(updates)).toMatchObject({ status: 'failed', error: 'disk full' })
  })

  it('cancels through the abort signal', async () => {
    const tasks = new TaskManager()
    const updates: TaskSnapshot[] = []
    tasks.on('update', (s) => updates.push(s))

    const { id, result } = tasks.run('Extract', async (ctx) => {
      await new Promise<void>((resolve) => ctx.signal.addEventListener('abort', () => resolve()))
      ctx.throwIfCancelled()
    })
    tasks.cancel(id)

    await expect(result).rejects.toThrow('Cancelled')
    expect(lastUpdate(updates).status).toBe('cancelled')
  })

  it('only dismisses finished tasks', async () => {
    const tasks = new TaskManager()
    let finish!: () => void
    const { id, result } = tasks.run('Wait', () => new Promise<void>((r) => (finish = r)))

    tasks.dismiss(id)
    expect(tasks.list()).toHaveLength(1)

    finish()
    await result
    tasks.dismiss(id)
    expect(tasks.list()).toHaveLength(0)
  })
})
