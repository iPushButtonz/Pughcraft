import { describe, expect, it, beforeEach } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile, utimes } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerConfig } from '@shared/servers'
import type { TaskContext } from '../tasks'
import { BackupStore } from './store'

const ctx: TaskContext = {
  signal: new AbortController().signal,
  step: () => undefined,
  progress: () => undefined,
  bytes: () => undefined,
  throwIfCancelled: () => undefined
}

const config = { mcVersion: '26.2' } as ServerConfig
const meta = (reason: string, kind: 'auto' | 'manual' | 'safety' = 'auto') => ({
  kind,
  reason,
  config,
  levelName: 'world',
  worldName: 'Test'
})

let root: string
let store: BackupStore

async function put(rel: string, text: string): Promise<void> {
  const file = join(root, ...rel.split('/'))
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, text)
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'pughcraft-backup-test-'))
  store = new BackupStore(join(root, 'backups'))
  await put('server/server.properties', 'motd=Hi\n')
  await put('server/world/level.dat', 'LEVEL')
  await put('server/world/region/r.0.0.mca', 'A'.repeat(1000))
  await put('server/logs/latest.log', 'noise')
  await put('worlds/other/main/level.dat', 'OTHER')
})

describe('BackupStore', () => {
  it('stores unchanged files only once', async () => {
    const first = await store.create(root, meta('first'), ctx)
    expect(first.files.map((f) => f.p).sort()).toEqual([
      'server/server.properties',
      'server/world/level.dat',
      'server/world/region/r.0.0.mca',
      'worlds/other/main/level.dat'
    ])
    expect(first.newBytes).toBeGreaterThan(1000)

    await put('server/world/level.dat', 'LEVEL2')
    const second = await store.create(root, meta('second'), ctx)
    // Only the changed level.dat is new.
    expect(second.newBytes).toBe('LEVEL2'.length)
  })

  it('restores the whole server, removing files added since', async () => {
    const snap = await store.create(root, meta('snap'), ctx)
    await put('server/world/level.dat', 'BROKEN')
    await put('server/world/region/r.9.9.mca', 'NEW')
    await store.restore(snap.id, root, 'server', ctx)
    expect(await readFile(join(root, 'server/world/level.dat'), 'utf8')).toBe('LEVEL')
    expect(existsSync(join(root, 'server/world/region/r.9.9.mca'))).toBe(false)
    // Logs are never touched by backups or restores.
    expect(existsSync(join(root, 'server/logs/latest.log'))).toBe(true)
  })

  it('cleans up folders a restore emptied, but not ones the user made', async () => {
    const snap = await store.create(root, meta('snap'), ctx)
    await put('worlds/added-later/main/level.dat', 'NEW')
    await put('worlds/added-later/main/session.lock', 'x')
    await mkdir(join(root, 'server/plugins'), { recursive: true })
    await store.restore(snap.id, root, 'server', ctx)
    expect(existsSync(join(root, 'worlds/added-later'))).toBe(false)
    expect(existsSync(join(root, 'worlds/other/main/level.dat'))).toBe(true)
    expect(existsSync(join(root, 'server/plugins'))).toBe(true)
  })

  it('restores only the world when asked', async () => {
    const snap = await store.create(root, meta('snap'), ctx)
    await put('server/world/level.dat', 'BROKEN')
    await put('server/server.properties', 'motd=Changed\n')
    await store.restore(snap.id, root, 'world', ctx)
    expect(await readFile(join(root, 'server/world/level.dat'), 'utf8')).toBe('LEVEL')
    expect(await readFile(join(root, 'server/server.properties'), 'utf8')).toBe('motd=Changed\n')
  })

  it('keeps the newest automatic backups, never manual or protected ones', async () => {
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      await put('server/world/level.dat', `L${i}`)
      // Distinct timestamps so ordering is stable.
      const m = await store.create(root, meta(`auto ${i}`), ctx)
      ids.push(m.id)
      await new Promise((r) => setTimeout(r, 5))
    }
    const manual = await store.create(root, meta('manual', 'manual'), ctx)
    await store.setProtected(ids[0], true)
    const removed = await store.prune(2)
    const left = (await store.list()).map((m) => m.id)
    expect(removed).toBe(1)
    expect(left).toContain(manual.id)
    expect(left).toContain(ids[0])
    expect(left).toContain(ids[3])
    expect(left).not.toContain(ids[1])
  })

  it('moves backups to another folder, but never into itself', async () => {
    const a = await store.create(root, meta('a'), ctx)
    await expect(store.moveTo(join(root, 'backups', 'inside'), ctx)).rejects.toThrow()
    const moved = new BackupStore(join(root, 'elsewhere'))
    await store.moveTo(moved.dir, ctx)
    expect(existsSync(store.dir)).toBe(false)
    expect((await moved.list()).map((m) => m.id)).toEqual([a.id])
    // Moving a store that has no backups yet is fine.
    await new BackupStore(join(root, 'nothing')).moveTo(join(root, 'nothing2'), ctx)
  })

  it('deleting a backup keeps files other backups still need', async () => {
    const a = await store.create(root, meta('a'), ctx)
    await put('server/world/level.dat', 'LATER')
    await utimes(join(root, 'server/world/level.dat'), new Date(), new Date(Date.now() + 1000))
    const b = await store.create(root, meta('b'), ctx)
    await store.delete(a.id)
    await rm(join(root, 'server'), { recursive: true, force: true })
    await store.restore(b.id, root, 'server', ctx)
    expect(await readFile(join(root, 'server/world/region/r.0.0.mca'), 'utf8')).toBe('A'.repeat(1000))
  })
})
