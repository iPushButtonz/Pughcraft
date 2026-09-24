import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { basename, join } from 'node:path'
import { shell } from 'electron'
import type {
  ConsoleLine,
  CreateServerRequest,
  LaunchSpec,
  Loader,
  ServerConfig,
  ServerPropertiesView,
  ServerStatus,
  ServerSummary,
  SimpleProperties
} from '@shared/servers'
import { DEFAULT_NETWORK, type ServerNetworkConfig } from '@shared/network'
import type { WorldInfo } from '@shared/imports'
import { DEFAULT_BACKUP_SCHEDULE, type BackupSchedule } from '@shared/backups'
import type { SettingsStore } from '../settings'
import type { TaskContext, TaskManager } from '../tasks'
import { temurinMajorFor, type JavaManager } from '../core/java'
import { isAtLeast, type MojangMeta } from '../core/mojang'
import { LOADERS } from '../core/loaders'
import { download } from '../core/http'
import { logger } from '../log'
import { ServerProcess, type ExitInfo } from './process'
import { PropertiesFile } from './properties'
import { applySimple, readSimple, type VersionFeatures } from './simple'
import { defaultJvmArgs, log4jFixFor } from './jvm'
import { explainCrash } from './crash'
import { WorldStore } from './worlds'
import { findClientOnlyCulprit } from '../import/culprit'
import { isPortFree, memoryInfo, pickPort } from './system'

const log = logger('servers')

const CRASH_WINDOW_MS = 10 * 60 * 1000
const MAX_AUTO_RESTARTS = 3
/** Game-only mods the trial start may set aside in one go. */
const MAX_AUTO_FIXES = 10

interface Entry {
  config: ServerConfig
  status: ServerStatus
  problem: string | null
  proc: ServerProcess | null
  buffer: ConsoleLine[]
  seq: number
  players: string[]
  maxPlayers: number | null
  restartNeeded: boolean
  crashes: number[]
  taskId: string | null
  /** How setup runs, kept so "Retry setup" repeats it exactly. */
  plan: SetupPlan | null
  /** Game-only mods already set aside by the trial start. */
  autoFixes: number
  /** Inside start(), before the Java process exists. */
  launching: boolean
}

/** Copies imported content into the new server folder during setup. */
export type Populate = (
  ctx: TaskContext,
  serverDir: string
) => Promise<{ launch?: LaunchSpec | null } | void>

interface SetupPlan {
  /** Gameplay basics from the Create dialog. */
  initial?: CreateServerRequest
  populate?: Populate
}

interface Deps {
  libraryRoot: () => string
  settings: SettingsStore
  tasks: TaskManager
  java: JavaManager
  mojang: MojangMeta
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return `${slug || 'server'}-${randomBytes(3).toString('hex')}`
}

async function writeAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.tmp`
  await writeFile(tmp, text, 'utf8')
  await rename(tmp, file)
}

export class ServerManager extends EventEmitter<{
  changed: [ServerSummary]
  removed: [string]
  console: [{ id: string; lines: ConsoleLine[] }]
  activity: [runningCount: number]
  worlds: [id: string]
}> {
  private readonly entries = new Map<string, Entry>()
  /** Checks that must pass before a server starts, e.g. "no backup is being restored". */
  private readonly startGates: ((id: string) => Promise<void>)[] = []

  constructor(private readonly deps: Deps) {
    super()
  }

  // ------------------------------------------------------------ paths

  private get serversRoot(): string {
    return join(this.deps.libraryRoot(), 'servers')
  }
  private rootOf(id: string): string {
    return join(this.serversRoot, id)
  }
  serverDir(id: string): string {
    return join(this.rootOf(id), 'server')
  }
  private configFile(id: string): string {
    return join(this.rootOf(id), 'pughcraft.json')
  }

  // ------------------------------------------------------------ state

  async load(): Promise<void> {
    await mkdir(this.serversRoot, { recursive: true })
    for (const id of await readdir(this.serversRoot)) {
      try {
        const config = JSON.parse(await readFile(this.configFile(id), 'utf8')) as ServerConfig
        if (config.schema !== 1 || config.id !== id) continue
        this.entries.set(id, this.newEntry(config))
      } catch {
        // Not a server folder.
      }
    }
    log.info(`loaded ${this.entries.size} server(s)`)
  }

  private newEntry(config: ServerConfig): Entry {
    return {
      config,
      status: 'stopped',
      problem: config.installed ? null : "Setup didn't finish.",
      proc: null,
      buffer: [],
      seq: 0,
      players: [],
      maxPlayers: null,
      restartNeeded: false,
      crashes: [],
      taskId: null,
      plan: null,
      autoFixes: 0,
      launching: false
    }
  }

  private summary(e: Entry): ServerSummary {
    return {
      config: e.config,
      status: e.status,
      problem: e.problem,
      players: e.players,
      maxPlayers: e.maxPlayers,
      restartNeeded: e.restartNeeded,
      taskId: e.taskId
    }
  }

  list(): ServerSummary[] {
    return [...this.entries.values()]
      .map((e) => this.summary(e))
      .sort((a, b) => a.config.createdAt.localeCompare(b.config.createdAt))
  }

  private entry(id: string): Entry {
    const e = this.entries.get(id)
    if (!e) throw new Error('That server no longer exists.')
    return e
  }

  private changed(e: Entry): void {
    this.emit('changed', this.summary(e))
  }

  private setStatus(e: Entry, status: ServerStatus, problem: string | null = e.problem): void {
    const wasRunning = this.runningCount()
    e.status = status
    e.problem = problem
    this.changed(e)
    if (this.runningCount() !== wasRunning) this.emit('activity', this.runningCount())
  }

  runningCount(): number {
    return [...this.entries.values()].filter((e) => e.proc !== null).length
  }

  private async saveConfig(e: Entry): Promise<void> {
    await writeAtomic(this.configFile(e.config.id), JSON.stringify(e.config, null, 2))
  }

  private appLine(e: Entry, text: string): void {
    const line: ConsoleLine = { seq: ++e.seq, text, source: 'app' }
    e.buffer.push(line)
    this.emit('console', { id: e.config.id, lines: [line] })
  }

  // ------------------------------------------------------------ create & install

  async create(req: CreateServerRequest): Promise<{ id: string; taskId: string }> {
    if (!(req.loader in LOADERS)) throw new Error('Unknown server type.')
    const e = await this.register(req.name, req, req.port)
    const plan: SetupPlan = { initial: req }
    e.plan = plan
    return { id: e.config.id, taskId: this.runInstall(e, plan) }
  }

  /**
   * A server built from imported content (world, server folder, modpack, instance).
   * `populate` copies the files in during setup; it may also say how to launch them.
   */
  async createImported(opts: {
    name: string
    mcVersion: string
    loader: Loader
    loaderVersion: string | null
    memoryMb: number
    acceptEula: boolean
    populate: Populate
  }): Promise<{ id: string; taskId: string }> {
    const e = await this.register(opts.name, opts, null)
    const plan: SetupPlan = { populate: opts.populate }
    e.plan = plan
    return { id: e.config.id, taskId: this.runInstall(e, plan) }
  }

  private async register(
    rawName: string,
    fields: { mcVersion: string; loader: Loader; loaderVersion: string | null; memoryMb: number; acceptEula: boolean },
    requestedPort: number | null
  ): Promise<Entry> {
    const name = rawName.trim().slice(0, 40)
    if (!name) throw new Error('Give your server a name.')
    const memoryMb = Math.round(Math.min(Math.max(fields.memoryMb, 512), memoryInfo().maxMb))
    if (!this.deps.settings.get().eulaAcceptedAt) {
      if (!fields.acceptEula) throw new Error('Please agree to the Minecraft EULA to create a server.')
      await this.deps.settings.update({ eulaAcceptedAt: new Date().toISOString() })
    }
    // Picking a port and registering the server happen under one lock so two quick
    // creates can't both grab the same free port.
    const release = await this.lock()
    let e: Entry
    try {
      const taken = new Set([...this.entries.values()].map((x) => x.config.port))
      const port = requestedPort ?? (await pickPort(taken))
      e = this.newEntry(this.initialConfig(name, fields, memoryMb, port))
      e.problem = null
      this.entries.set(e.config.id, e)
    } finally {
      release()
    }
    const id = e.config.id
    await mkdir(this.serverDir(id), { recursive: true })
    await mkdir(join(this.rootOf(id), 'worlds'), { recursive: true })
    await mkdir(join(this.rootOf(id), 'backups'), { recursive: true })
    await this.saveConfig(e)
    return e
  }

  private lockChain: Promise<void> = Promise.resolve()

  /** A tiny mutex: resolves with a release function once earlier holders are done. */
  private lock(): Promise<() => void> {
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))
    const ready = this.lockChain.then(() => release)
    this.lockChain = this.lockChain.then(() => held)
    return ready
  }

  private initialConfig(
    name: string,
    req: { mcVersion: string; loader: Loader; loaderVersion: string | null },
    memoryMb: number,
    port: number
  ): ServerConfig {
    const id = slugify(name)
    return {
      schema: 1,
      id,
      name,
      mcVersion: req.mcVersion,
      loader: req.loader,
      loaderVersion: req.loaderVersion,
      javaMajor: 0,
      javaPath: null,
      memoryMb,
      port,
      jvmArgs: [],
      launch: null,
      installed: false,
      createdAt: new Date().toISOString(),
      lastStartedAt: null
    }
  }

  /** Re-runs setup for a server whose install failed or was cancelled. */
  retryInstall(id: string): string {
    const e = this.entry(id)
    if (e.proc) throw new Error('Stop the server first.')
    return this.runInstall(e, e.plan ?? {})
  }

  private runInstall(e: Entry, plan: SetupPlan): string {
    const { id: taskId, result } = this.deps.tasks.run(`Setting up ${e.config.name}`, (ctx) =>
      this.install(e, ctx, plan)
    )
    e.taskId = taskId
    this.setStatus(e, 'installing', null)
    result.then(
      () => {
        e.taskId = null
        this.setStatus(e, 'stopped', null)
        // New servers come online by themselves once setup is done (owner's choice).
        this.start(e.config.id).catch((err: Error) => this.setStatus(e, 'stopped', err.message))
      },
      (err: Error) => {
        e.taskId = null
        const cancelled =
          err.message === 'Cancelled' || err.name === 'CancelledError' || err.name === 'AbortError'
        this.setStatus(
          e,
          'stopped',
          cancelled ? 'Setup was cancelled.' : `Setup didn't finish: ${err.message}`
        )
      }
    )
    return taskId
  }

  private async install(e: Entry, ctx: TaskContext, plan: SetupPlan): Promise<void> {
    const c = e.config
    const initial = plan.initial
    const dir = this.serverDir(c.id)
    await mkdir(dir, { recursive: true })
    ctx.step('Checking Minecraft version')
    const details = await this.deps.mojang.details(c.mcVersion, ctx.signal).catch(() => null)
    if (!details && c.loader !== 'custom') throw new Error(`Minecraft ${c.mcVersion} isn't a known version.`)
    const javaMajor = details?.javaMajor ?? 21
    const javaPath = c.javaPath ?? (await this.deps.java.ensure(javaMajor, ctx))
    ctx.throwIfCancelled()

    // Imported content goes in first; it may bring its own server software.
    const hints = plan.populate ? ((await plan.populate(ctx, dir)) ?? {}) : {}
    ctx.throwIfCancelled()

    let result: { launch: LaunchSpec; loaderVersion: string | null }
    if (hints.launch) {
      result = { launch: hints.launch, loaderVersion: c.loaderVersion }
    } else if (c.loader === 'custom') {
      throw new Error("Couldn't find how to start this server. Pick its server type in the import screen.")
    } else {
      result = await LOADERS[c.loader].install({
        ctx,
        serverDir: dir,
        mcVersion: c.mcVersion,
        loaderVersion: c.loaderVersion,
        javaPath,
        mojang: this.deps.mojang
      })
    }

    const fix = log4jFixFor(c.loader, await this.log4jBand(c.mcVersion))
    if (fix?.file) {
      ctx.step('Applying the Log4Shell security fix')
      await download({
        url: fix.file.url,
        dest: join(dir, fix.file.name),
        checksum: { algorithm: 'sha1', hex: fix.file.sha1 },
        signal: ctx.signal
      })
    }

    ctx.step('Preparing server files')
    await this.writeEula(dir)
    const propsFile = join(dir, 'server.properties')
    const props = existsSync(propsFile)
      ? PropertiesFile.parse(await readFile(propsFile, 'utf8'))
      : PropertiesFile.empty()
    props.set('server-port', String(c.port))
    if (!props.has('motd')) props.set('motd', c.name)
    if (initial) {
      applySimple(
        props,
        { gamemode: initial.gamemode, difficulty: initial.difficulty, whitelist: initial.whitelist },
        await this.features(c.mcVersion)
      )
      if (initial.seed.trim()) props.set('level-seed', initial.seed.trim().slice(0, 64))
    }
    await writeAtomic(propsFile, props.serialize())

    c.javaMajor = javaMajor
    c.launch = result.launch
    c.loaderVersion = result.loaderVersion
    if (c.jvmArgs.length === 0) c.jvmArgs = defaultJvmArgs(fix)
    c.installed = true
    await this.saveConfig(e)
    this.appLine(e, `Setup finished: Minecraft ${c.mcVersion}${c.loaderVersion ? ` · ${c.loader} ${c.loaderVersion}` : ''}.`)
  }

  private async log4jBand(mc: string): Promise<'pre-1.12' | '1.12-1.16' | '1.17-1.18.0' | 'safe'> {
    const m = this.deps.mojang
    if (!(await isAtLeast(m, mc, '1.12'))) return 'pre-1.12'
    if (!(await isAtLeast(m, mc, '1.17'))) return '1.12-1.16'
    if (!(await isAtLeast(m, mc, '1.18.1'))) return '1.17-1.18.0'
    return 'safe'
  }

  private async writeEula(dir: string): Promise<void> {
    const agreed = this.deps.settings.get().eulaAcceptedAt
    if (!agreed) return
    await writeFile(
      join(dir, 'eula.txt'),
      `# Agreed to the Minecraft EULA (https://aka.ms/MinecraftEULA) in Pughcraft on ${agreed}.\neula=true\n`
    )
  }

  // ------------------------------------------------------------ run

  async start(id: string): Promise<void> {
    const e = this.entry(id)
    if (e.proc || e.launching) return
    if (!e.config.installed || !e.config.launch) throw new Error("This server's setup didn't finish. Retry setup first.")
    if (!this.deps.settings.get().eulaAcceptedAt) throw new Error('Please agree to the Minecraft EULA first.')
    e.launching = true
    try {
      for (const gate of this.startGates) await gate(id)
      await this.launch(e)
    } finally {
      e.launching = false
    }
  }

  private async launch(e: Entry): Promise<void> {
    const id = e.config.id
    const c = e.config
    if (!c.launch) throw new Error("This server's setup didn't finish. Retry setup first.")
    const dir = this.serverDir(id)
    await this.writeEula(dir)
    if (!(await isPortFree(c.port))) {
      throw new Error(
        `Port ${c.port} is already in use by another program. Close it, or change this server's port in Settings (Advanced).`
      )
    }

    let javaPath = c.javaPath
    if (!javaPath) {
      const wanted = temurinMajorFor(c.javaMajor)
      const managed = (await this.deps.java.installed()).find((j) => j.major === wanted)
      javaPath =
        managed?.path ??
        (await this.deps.tasks.run(`Getting Java ${c.javaMajor}`, (ctx) =>
          this.deps.java.ensure(c.javaMajor, ctx)
        ).result)
    }

    const launchArgs =
      c.launch.kind === 'jar'
        ? ['-jar', c.launch.jar]
        : [
            ...(existsSync(join(dir, 'user_jvm_args.txt')) ? ['@user_jvm_args.txt'] : []),
            `@${c.launch.dir}/${process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt'}`
          ]
    const args = [`-Xmx${c.memoryMb}M`, `-Xms${c.memoryMb}M`, ...c.jvmArgs, ...launchArgs, 'nogui']

    const maxPlayers = await this.readProps(id).then((p) => Number(p.get('max-players') ?? 20))
    const proc = new ServerProcess(e.buffer, () => ++e.seq)
    e.proc = proc
    e.maxPlayers = maxPlayers
    e.restartNeeded = false
    proc.on('lines', (lines) => this.emit('console', { id, lines }))
    proc.on('phase', (phase) => {
      if (phase === 'running') this.setStatus(e, 'running', null)
      if (phase === 'stopping') this.setStatus(e, 'stopping')
    })
    proc.on('players', (players) => {
      e.players = players
      this.changed(e)
    })
    proc.on('exit', (info) => this.onExit(e, info))

    c.lastStartedAt = new Date().toISOString()
    await this.saveConfig(e)
    this.setStatus(e, 'starting', null)
    proc.start(javaPath, args, dir)
    this.emit('activity', this.runningCount())
  }

  private onExit(e: Entry, info: ExitInfo): void {
    e.proc = null
    e.players = []
    if (info.requested) {
      this.setStatus(e, 'stopped', null)
      return
    }
    const reason = explainCrash(info.tail, e.config.port)
    const now = Date.now()
    e.crashes = [...e.crashes.filter((t) => now - t < CRASH_WINDOW_MS), now]
    // Only auto-restart servers that had been running; a server that can't even start
    // would just fail again the same way.
    const wasRunning = info.tail.some((l) => /Done \([\d.,]+s\)!/.test(l))

    // A modded server that dies on startup because of a game-only mod: set the mod aside
    // and try again (the "trial start" from SPEC §4.2). Bounded so it can never loop.
    const modded = e.config.loader === 'fabric' || e.config.loader === 'forge' || e.config.loader === 'neoforge'
    if (!wasRunning && modded && e.autoFixes < MAX_AUTO_FIXES) {
      const dir = this.serverDir(e.config.id)
      void findClientOnlyCulprit(info.tail, join(dir, 'mods')).then(async (culprit) => {
        if (!culprit) return this.setStatus(e, 'crashed', reason)
        e.autoFixes++
        await mkdir(join(dir, 'mods-client-only'), { recursive: true })
        await rename(culprit.file, join(dir, 'mods-client-only', basename(culprit.file)))
        this.appLine(e, `${culprit.name} only works inside the game, not on servers. It was moved to "mods-client-only" and the server is starting again.`)
        e.crashes = e.crashes.slice(0, -1)
        this.start(e.config.id).catch((err: Error) => this.setStatus(e, 'crashed', err.message))
      })
      return
    }
    if (wasRunning && e.crashes.length <= MAX_AUTO_RESTARTS) {
      this.appLine(e, `The server crashed. Restarting automatically (${e.crashes.length} of ${MAX_AUTO_RESTARTS})…`)
      this.setStatus(e, 'crashed', reason)
      setTimeout(() => {
        if (e.status === 'crashed' && !e.proc) {
          this.start(e.config.id).catch((err: Error) => this.setStatus(e, 'crashed', err.message))
        }
      }, 5000)
      return
    }
    const note = wasRunning ? ' It crashed several times in a row, so it was not restarted.' : ''
    this.setStatus(e, 'crashed', reason + note)
  }

  async stop(id: string): Promise<void> {
    const e = this.entry(id)
    await e.proc?.stop()
  }

  async kill(id: string): Promise<void> {
    await this.entry(id).proc?.kill()
  }

  async restart(id: string): Promise<void> {
    await this.stop(id)
    await this.start(id)
  }

  command(id: string, text: string): void {
    const e = this.entry(id)
    if (!e.proc?.command(text)) throw new Error('The server is not running.')
  }

  consoleBuffer(id: string): ConsoleLine[] {
    return this.entry(id).buffer
  }

  /** Saves and stops every running server. Used when the app quits. */
  async stopAll(): Promise<void> {
    await Promise.all([...this.entries.values()].map((e) => e.proc?.stop()))
  }

  // ------------------------------------------------------------ settings

  private async readProps(id: string): Promise<PropertiesFile> {
    const file = join(this.serverDir(id), 'server.properties')
    return existsSync(file) ? PropertiesFile.parse(await readFile(file, 'utf8')) : PropertiesFile.empty()
  }

  private async features(mc: string): Promise<VersionFeatures> {
    const m = this.deps.mojang
    return {
      numericModes: !(await isAtLeast(m, mc, '1.14')),
      simulationDistance: await isAtLeast(m, mc, '1.18'),
      pvpInProperties: !(await isAtLeast(m, mc, '1.21.9')),
      enforceWhitelist: await isAtLeast(m, mc, '1.13')
    }
  }

  async properties(id: string): Promise<ServerPropertiesView> {
    const e = this.entry(id)
    const props = await this.readProps(id)
    const complete = props.has('level-name')
    return {
      simple: readSimple(props, await this.features(e.config.mcVersion), complete),
      raw: props.serialize(),
      complete
    }
  }

  private markRestartNeeded(e: Entry): void {
    if (e.proc) {
      e.restartNeeded = true
      this.changed(e)
    }
  }

  async setSimple(id: string, patch: Partial<SimpleProperties>): Promise<ServerPropertiesView> {
    const e = this.entry(id)
    const props = await this.readProps(id)
    applySimple(props, patch, await this.features(e.config.mcVersion))
    await writeAtomic(join(this.serverDir(id), 'server.properties'), props.serialize())
    if (patch.maxPlayers !== undefined) e.maxPlayers = Number(props.get('max-players'))
    this.markRestartNeeded(e)
    return this.properties(id)
  }

  async setRaw(id: string, text: string): Promise<ServerPropertiesView> {
    const e = this.entry(id)
    const props = PropertiesFile.parse(text)
    await writeAtomic(join(this.serverDir(id), 'server.properties'), props.serialize())
    const port = Number(props.get('server-port'))
    if (Number.isInteger(port) && port > 0 && port < 65536 && port !== e.config.port) {
      e.config.port = port
      await this.saveConfig(e)
    }
    this.markRestartNeeded(e)
    return this.properties(id)
  }

  async update(
    id: string,
    patch: { name?: string; memoryMb?: number; jvmArgs?: string[]; port?: number }
  ): Promise<ServerSummary> {
    const e = this.entry(id)
    const c = e.config
    if (patch.name !== undefined && patch.name.trim()) c.name = patch.name.trim().slice(0, 40)
    if (patch.memoryMb !== undefined) {
      c.memoryMb = Math.round(Math.min(Math.max(patch.memoryMb, 512), memoryInfo().maxMb))
      this.markRestartNeeded(e)
    }
    if (patch.jvmArgs !== undefined) {
      c.jvmArgs = patch.jvmArgs.map((a) => a.trim()).filter(Boolean)
      this.markRestartNeeded(e)
    }
    if (patch.port !== undefined && patch.port !== c.port) {
      if (!Number.isInteger(patch.port) || patch.port < 1024 || patch.port > 65535) {
        throw new Error('Pick a port between 1024 and 65535.')
      }
      c.port = patch.port
      const props = await this.readProps(id)
      props.set('server-port', String(c.port))
      await writeAtomic(join(this.serverDir(id), 'server.properties'), props.serialize())
      this.markRestartNeeded(e)
    }
    await this.saveConfig(e)
    this.changed(e)
    return this.summary(e)
  }

  // ------------------------------------------------------------ remove

  /** Moves the whole server folder (worlds and backups included) to the Recycle Bin. */
  async remove(id: string): Promise<void> {
    const e = this.entry(id)
    if (e.status === 'installing') throw new Error('Wait for setup to finish or cancel it first.')
    if (e.proc) await e.proc.stop()
    await shell.trashItem(this.rootOf(id))
    this.entries.delete(id)
    this.emit('removed', id)
  }

  async openFolder(id: string): Promise<void> {
    this.entry(id)
    await shell.openPath(this.serverDir(id))
  }

  // ------------------------------------------------------------ backups hooks

  /** The folder holding this server's files, worlds store and default backups. */
  rootDir(id: string): string {
    this.entry(id)
    return this.rootOf(id)
  }

  isLive(id: string): boolean {
    const e = this.entry(id)
    return e.proc !== null || e.launching
  }

  async activeLevel(id: string): Promise<{ levelName: string; worldName: string | null }> {
    const store = this.worldStore(id)
    const levelName = await store.levelName()
    const active = (await store.list()).find((w) => w.active)
    return { levelName, worldName: active?.levelName ?? null }
  }

  /**
   * Runs `fn` while a running server has world saving paused and everything flushed to disk,
   * so a backup never catches half-written files. A stopped server just runs `fn`.
   */
  async withSavesPaused<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const e = this.entry(id)
    const proc = e.proc
    if (!proc || e.status !== 'running') return fn()
    const modern = await isAtLeast(this.deps.mojang, e.config.mcVersion, '1.13')
    proc.command('save-off')
    // "Saved the game" (1.13+) / "Saved the world" comes last, after every dimension is flushed.
    const saved = proc.waitForLine(/Saved the (game|world)|Saving is already/i, 60_000)
    proc.command(modern ? 'save-all flush' : 'save-all')
    await saved
    try {
      return await fn()
    } finally {
      if (e.proc === proc) proc.command('save-on')
    }
  }

  backupSchedule(id: string): BackupSchedule {
    return { ...DEFAULT_BACKUP_SCHEDULE, ...this.entry(id).config.backups }
  }

  async setBackupSchedule(id: string, schedule: BackupSchedule): Promise<void> {
    const e = this.entry(id)
    e.config.backups = schedule
    await this.saveConfig(e)
    this.changed(e)
  }

  /** After restoring a whole-server backup: go back to the server software it had then. */
  async restoreSoftware(id: string, from: ServerConfig): Promise<void> {
    const e = this.entry(id)
    const c = e.config
    c.mcVersion = from.mcVersion
    c.loader = from.loader
    c.loaderVersion = from.loaderVersion
    c.launch = from.launch
    c.javaMajor = from.javaMajor
    c.installed = from.installed
    await this.saveConfig(e)
    this.changed(e)
  }

  appNote(id: string, text: string): void {
    this.appLine(this.entry(id), text)
  }

  addStartGate(gate: (id: string) => Promise<void>): void {
    this.startGates.push(gate)
  }

  /** Files changed behind the world list's back (e.g. a restore); tell the UI. */
  worldsChanged(id: string): void {
    this.emit('worlds', id)
  }

  // ------------------------------------------------------------ worlds

  private worldStore(id: string): WorldStore {
    return new WorldStore(this.serverDir(id), join(this.rootOf(id), 'worlds'))
  }

  worlds(id: string): Promise<WorldInfo[]> {
    this.entry(id)
    return this.worldStore(id).list()
  }

  /** Copies a world in as another (inactive) world of this server. */
  async addWorld(id: string, source: string, name: string, ctx: TaskContext): Promise<void> {
    this.entry(id)
    ctx.step(`Copying ${name}`)
    await this.worldStore(id).add(source, name, { signal: ctx.signal, onProgress: (d, t) => ctx.bytes(d, t) })
    this.emit('worlds', id)
  }

  async activateWorld(id: string, slot: string): Promise<void> {
    const e = this.entry(id)
    if (e.proc) throw new Error('Stop the server before switching worlds.')
    await this.worldStore(id).activate(slot)
    this.appLine(e, 'Switched worlds. The new one loads on the next start.')
    this.emit('worlds', id)
  }

  async removeWorld(id: string, slot: string): Promise<void> {
    this.entry(id)
    const info = (await this.worldStore(id).list()).find((w) => w.slot === slot)
    if (info?.active) throw new Error("The active world can't be deleted. Switch to another world first.")
    await this.worldStore(id).remove(slot)
    this.emit('worlds', id)
  }

  // ------------------------------------------------------------ networking hooks

  get(id: string): ServerSummary {
    return this.summary(this.entry(id))
  }

  networkConfig(id: string): ServerNetworkConfig {
    return { ...DEFAULT_NETWORK, ...this.entry(id).config.network }
  }

  async setNetwork(id: string, patch: Partial<ServerNetworkConfig>): Promise<ServerNetworkConfig> {
    const e = this.entry(id)
    e.config.network = { ...this.networkConfig(id), ...patch }
    await this.saveConfig(e)
    this.changed(e)
    return e.config.network
  }

  /** The java executable this server runs with, if it's already on disk. */
  async javaPathFor(id: string): Promise<string | null> {
    const c = this.entry(id).config
    if (c.javaPath) return c.javaPath
    const wanted = temurinMajorFor(c.javaMajor || 21)
    return (await this.deps.java.installed()).find((j) => j.major === wanted)?.path ?? null
  }

  /** Every managed java executable plus every port in use, for the one-time firewall fix. */
  async firewallTargets(): Promise<{ javaPaths: string[]; ports: number[] }> {
    return {
      javaPaths: (await this.deps.java.installed()).map((j) => j.path),
      ports: [...new Set([...this.entries.values()].map((e) => e.config.port))]
    }
  }
}
