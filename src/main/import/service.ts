import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import type { FoundItem, ImportAnalysis, ImportRequest } from '@shared/imports'
import type { TaskContext, TaskManager } from '../tasks'
import { isAtLeast, type MojangMeta } from '../core/mojang'
import type { ServerManager } from '../servers/manager'
import { download } from '../core/http'
import { copyDir, moveDir } from '../core/fsutil'
import { PropertiesFile } from '../servers/properties'
import { analyzeSource, type AnalysisDetails } from './analyze'
import type { ScannedMod } from './mods'
import { scanLaunchers } from './scan'
import { logger } from '../log'

const log = logger('import')

/** Folders that carry a modpack's settings and scripts; copied from instances. */
const CONFIG_DIRS = ['config', 'defaultconfigs', 'kubejs', 'scripts', 'global_packs']
const ANALYSIS_TTL_MS = 60 * 60 * 1000

function inside(root: string, rel: string): string {
  const target = resolve(root, rel)
  if (!target.startsWith(resolve(root) + sep)) throw new Error(`Unsafe path in the pack: ${rel}`)
  return target
}

/**
 * Keeps the newest copy of any mod that's there twice and moves the rest to
 * `mods-disabled/`; client-only mods go to `mods-client-only/`. Nothing is deleted.
 */
async function tidyMods(serverDir: string, mods: ScannedMod[], removeClient: boolean): Promise<string[]> {
  const notes: string[] = []
  const modsDir = join(serverDir, 'mods')
  if (!existsSync(modsDir)) return notes
  const moveAside = async (file: string, folder: string): Promise<void> => {
    const from = join(modsDir, file)
    if (!existsSync(from)) return
    await mkdir(join(serverDir, folder), { recursive: true })
    await rename(from, join(serverDir, folder, basename(file)))
  }
  if (removeClient) {
    const client = mods.filter((m) => m.side === 'client')
    for (const m of client) await moveAside(m.file, 'mods-client-only')
    if (client.length) notes.push(`Set aside ${client.length} mod(s) that only work in the game: ${client.map((m) => m.name).join(', ')}.`)
  }
  const byId = new Map<string, ScannedMod[]>()
  for (const m of mods) if (m.id && m.side !== 'client') byId.set(m.id, [...(byId.get(m.id) ?? []), m])
  for (const list of byId.values()) {
    if (list.length < 2) continue
    const dated = await Promise.all(
      list.map(async (m) => ({ m, t: (await stat(join(modsDir, m.file)).catch(() => null))?.mtimeMs ?? 0 }))
    )
    dated.sort((x, y) => y.t - x.t)
    for (const { m } of dated.slice(1)) await moveAside(m.file, 'mods-disabled')
    notes.push(`Kept the newest copy of ${list[0].name}; the older one is in mods-disabled.`)
  }
  return notes
}

async function setLevelName(serverDir: string, levelName: string): Promise<void> {
  const file = join(serverDir, 'server.properties')
  const props = existsSync(file) ? PropertiesFile.parse(await readFile(file, 'utf8')) : PropertiesFile.empty()
  props.set('level-name', levelName)
  await writeFile(file, props.serialize(), 'utf8')
}

export class ImportService {
  private readonly analyses = new Map<string, { details: AnalysisDetails; at: number }>()
  private counter = 0

  constructor(
    private readonly deps: {
      tasks: TaskManager
      servers: ServerManager
      mojang: MojangMeta
      stagingDir: string
    }
  ) {}

  /** Clears leftovers from earlier sessions. */
  async init(): Promise<void> {
    await rm(this.deps.stagingDir, { recursive: true, force: true })
  }

  scan(): Promise<FoundItem[]> {
    return scanLaunchers()
  }

  /** Looks at a file or folder and returns what the review screen shows. */
  async analyze(sourcePath: string): Promise<ImportAnalysis> {
    this.expire()
    const id = `a${Date.now().toString(36)}${(this.counter++).toString(36)}`
    const { result } = this.deps.tasks.run(`Installing ${basename(sourcePath)}`, (ctx) =>
      analyzeSource(sourcePath, { ctx, stagingDir: this.deps.stagingDir, mojang: this.deps.mojang, id })
    )
    const details = await result
    this.analyses.set(id, { details, at: Date.now() })
    return details.analysis
  }

  private expire(): void {
    for (const [id, a] of this.analyses) {
      if (Date.now() - a.at > ANALYSIS_TTL_MS) void this.discard(id)
    }
  }

  async discard(id: string): Promise<void> {
    const entry = this.analyses.get(id)
    this.analyses.delete(id)
    if (entry?.details.staged) await rm(join(this.deps.stagingDir, id), { recursive: true, force: true })
  }

  async run(req: ImportRequest): Promise<{ serverId: string; taskId: string }> {
    const entry = this.analyses.get(req.analysisId)
    if (!entry) throw new Error('That import expired. Please drop the file in again.')
    const d = entry.details
    const a = d.analysis
    if (a.problems.length) throw new Error(a.problems[0])

    // A single world added to a server that already exists.
    if (a.kind === 'world' && req.target.kind === 'existing') {
      const serverId = req.target.serverId
      const serverVersion = this.deps.servers.get(serverId).config.mcVersion
      if (a.mcVersion && a.mcVersion !== serverVersion && (await isAtLeast(this.deps.mojang, a.mcVersion, serverVersion))) {
        throw new Error(
          `This world is from Minecraft ${a.mcVersion}, newer than that server (${serverVersion}). Servers can't load newer worlds.`
        )
      }
      const { id: taskId, result } = this.deps.tasks.run(`Adding ${a.name} to ${this.deps.servers.get(serverId).config.name}`, (ctx) =>
        this.deps.servers.addWorld(serverId, d.contentRoot, a.world?.levelName ?? a.name, ctx)
      )
      result.then(() => this.discard(req.analysisId), () => undefined)
      return { serverId, taskId }
    }

    const detectedSame = req.loader === a.loader && req.mcVersion === a.mcVersion && req.loaderVersion === a.loaderVersion
    const populate = async (ctx: TaskContext, dir: string): Promise<{ launch?: typeof d.launch }> => {
      const notes = await this.populate(ctx, dir, d, req)
      for (const n of notes) log.info(n)
      const icon = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(req.iconDataUrl ?? '')
      if (icon) await writeFile(join(dir, 'server-icon.png'), Buffer.from(icon[1], 'base64'))
      await this.discard(req.analysisId)
      return { launch: a.kind === 'server' && detectedSame ? d.launch : null }
    }
    return this.deps.servers.createImported({
      name: req.name,
      mcVersion: req.mcVersion,
      loader: req.loader,
      loaderVersion: req.loaderVersion,
      memoryMb: req.memoryMb,
      acceptEula: req.acceptEula,
      populate
    }).then(({ id, taskId }) => ({ serverId: id, taskId }))
  }

  private async populate(ctx: TaskContext, dir: string, d: AnalysisDetails, req: ImportRequest): Promise<string[]> {
    const a = d.analysis
    const bring = async (from: string, to: string, what: string): Promise<void> => {
      ctx.step(`Copying ${what}`)
      const opts = {
        signal: ctx.signal,
        onProgress: (done: number, total: number) => ctx.bytes(done, total),
        filter: (rel: string) => !/(^|[\\/])session\.lock$/.test(rel)
      }
      if (d.staged) await moveDir(from, to, opts)
      else await copyDir(from, to, opts)
    }

    switch (a.kind) {
      case 'world':
        await bring(d.contentRoot, join(dir, 'world'), 'the world')
        await setLevelName(dir, 'world')
        return []
      case 'server': {
        ctx.step('Copying the server files')
        await copyDir(d.root, dir, {
          signal: ctx.signal,
          onProgress: (done, total) => ctx.bytes(done, total),
          filter: (rel) => !/(^|[\\/])session\.lock$/.test(rel)
        })
        return tidyMods(dir, d.mods, req.removeClientMods)
      }
      case 'instance': {
        const modsDir = join(d.contentRoot, 'mods')
        const keep = d.mods.filter((m) => !(req.removeClientMods && m.side === 'client'))
        ctx.step('Copying mods')
        await mkdir(join(dir, 'mods'), { recursive: true })
        for (const [i, m] of keep.entries()) {
          ctx.throwIfCancelled()
          await copyFile(join(modsDir, m.file), join(dir, 'mods', basename(m.file)))
          ctx.progress((i + 1) / keep.length, `${i + 1} of ${keep.length} mods`)
        }
        ctx.step('Copying the modpack’s settings')
        for (const sub of CONFIG_DIRS) {
          if (existsSync(join(d.contentRoot, sub))) {
            await copyDir(join(d.contentRoot, sub), join(dir, sub), { signal: ctx.signal })
          }
        }
        if (req.worldFolder) {
          ctx.step('Copying the world')
          await copyDir(join(d.contentRoot, 'saves', req.worldFolder), join(dir, 'world'), {
            signal: ctx.signal,
            onProgress: (done, total) => ctx.bytes(done, total),
            filter: (rel) => !/(^|[\\/])session\.lock$/.test(rel)
          })
          await setLevelName(dir, 'world')
        }
        return tidyMods(dir, keep, false)
      }
      case 'mrpack': {
        const index = d.mrpack!
        const files = index.files.filter(
          (f) => !(req.removeClientMods && f.env?.server === 'unsupported')
        )
        const total = files.reduce((n, f) => n + (f.fileSize ?? 0), 0)
        let done = 0
        ctx.step(`Downloading ${files.length} files`)
        for (const f of files) {
          ctx.throwIfCancelled()
          const checksum = f.hashes.sha512
            ? { algorithm: 'sha512' as const, hex: f.hashes.sha512 }
            : f.hashes.sha1
              ? { algorithm: 'sha1' as const, hex: f.hashes.sha1 }
              : undefined
          const before = done
          await download({
            url: f.downloads[0],
            dest: inside(dir, f.path),
            checksum,
            signal: ctx.signal,
            onProgress: (d2) => ctx.bytes(before + d2, total || null)
          })
          done += f.fileSize ?? 0
        }
        for (const sub of ['overrides', 'server-overrides']) {
          const src = join(d.root, sub)
          if (existsSync(src)) {
            ctx.step('Copying the pack’s settings')
            await copyDir(src, dir, { signal: ctx.signal })
          }
        }
        return tidyMods(dir, d.mods, req.removeClientMods)
      }
      default:
        throw new Error('This kind of import is not supported.')
    }
  }
}
