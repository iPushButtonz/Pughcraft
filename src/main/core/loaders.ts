import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LaunchSpec, Loader } from '@shared/servers'
import type { TaskContext } from '../tasks'
import { download, getJson, getText, HttpError, type Checksum } from './http'
import { isAtLeast, type MojangMeta } from './mojang'
import { logger } from '../log'

const log = logger('loaders')

export type ManagedLoader = Exclude<Loader, 'custom'>

export interface LoaderVersion {
  id: string
  label: string
}

export interface InstallContext {
  ctx: TaskContext
  serverDir: string
  mcVersion: string
  /** null = the default (first) entry from `versions()`. */
  loaderVersion: string | null
  javaPath: string
  mojang: MojangMeta
}

export interface InstallResult {
  launch: LaunchSpec
  loaderVersion: string | null
}

interface LoaderModule {
  /** Newest-first versions for this Minecraft version; empty when unsupported. First = default. */
  versions(mc: string, mojang: MojangMeta, signal?: AbortSignal): Promise<LoaderVersion[]>
  install(ic: InstallContext): Promise<InstallResult>
}

/** Small in-memory cache for version lists that rarely change. */
function cached<T>(ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  let value: { data: T; at: number } | null = null
  return async () => {
    if (value && Date.now() - value.at < ttlMs) return value.data
    value = { data: await load(), at: Date.now() }
    return value.data
  }
}

async function firstOrChosen(
  mod: LoaderModule,
  ic: InstallContext,
  name: string
): Promise<string> {
  if (ic.loaderVersion) return ic.loaderVersion
  const [first] = await mod.versions(ic.mcVersion, ic.mojang, ic.ctx.signal)
  if (!first) throw new Error(`${name} isn't available for Minecraft ${ic.mcVersion}.`)
  return first.id
}

async function downloadVanillaJar(ic: InstallContext, fileName: string): Promise<void> {
  const details = await ic.mojang.details(ic.mcVersion, ic.ctx.signal)
  if (!details.server) throw new Error(`Mojang doesn't offer a server for Minecraft ${ic.mcVersion}.`)
  ic.ctx.step(`Downloading Minecraft ${ic.mcVersion}`)
  await download({
    url: details.server.url,
    dest: join(ic.serverDir, fileName),
    checksum: { algorithm: 'sha1', hex: details.server.sha1 },
    signal: ic.ctx.signal,
    onProgress: (done, total) => ic.ctx.bytes(done, total ?? details.server!.size)
  })
}

// ---------------------------------------------------------------- Vanilla

const vanilla: LoaderModule = {
  async versions(mc, mojang, signal) {
    const details = await mojang.details(mc, signal)
    return details.server ? [{ id: mc, label: mc }] : []
  },
  async install(ic) {
    await downloadVanillaJar(ic, 'server.jar')
    return { launch: { kind: 'jar', jar: 'server.jar' }, loaderVersion: null }
  }
}

// ---------------------------------------------------------------- Paper

const PAPER_API = 'https://fill.papermc.io/v3/projects/paper'

interface PaperBuild {
  id: number
  channel: 'STABLE' | 'BETA' | 'ALPHA' | 'RECOMMENDED'
  downloads: Record<string, { name: string; checksums: { sha256: string }; size: number; url: string }>
}

const paperProject = cached(60 * 60 * 1000, () =>
  getJson<{ versions: Record<string, string[]> }>(PAPER_API)
)

const paper: LoaderModule = {
  async versions(mc, _mojang, signal) {
    const project = await paperProject()
    if (!Object.values(project.versions).some((list) => list.includes(mc))) return []
    const builds = await getJson<PaperBuild[]>(`${PAPER_API}/versions/${mc}/builds`, signal)
    const sorted = [...builds].sort((a, b) => b.id - a.id)
    const isStable = (b: PaperBuild): boolean => b.channel === 'STABLE' || b.channel === 'RECOMMENDED'
    return [...sorted.filter(isStable), ...sorted.filter((b) => !isStable(b))].map((b) => ({
      id: String(b.id),
      label: `Build ${b.id}${isStable(b) ? '' : ' (experimental)'}`
    }))
  },
  async install(ic) {
    const buildId = await firstOrChosen(paper, ic, 'Paper')
    const build = await getJson<PaperBuild>(
      `${PAPER_API}/versions/${ic.mcVersion}/builds/${buildId}`,
      ic.ctx.signal
    )
    const file = build.downloads['server:default']
    if (!file) throw new Error(`Paper build ${buildId} has no server download.`)
    ic.ctx.step(`Downloading Paper ${ic.mcVersion}`)
    await download({
      url: file.url,
      dest: join(ic.serverDir, file.name),
      checksum: { algorithm: 'sha256', hex: file.checksums.sha256 },
      signal: ic.ctx.signal,
      onProgress: (done, total) => ic.ctx.bytes(done, total ?? file.size)
    })
    return { launch: { kind: 'jar', jar: file.name }, loaderVersion: buildId }
  }
}

// ---------------------------------------------------------------- Fabric

const FABRIC_META = 'https://meta.fabricmc.net/v2'

const fabricInstallers = cached(60 * 60 * 1000, () =>
  getJson<{ version: string; stable: boolean }[]>(`${FABRIC_META}/versions/installer`)
)

const fabric: LoaderModule = {
  async versions(mc, _mojang, signal) {
    let list: { loader: { version: string; stable: boolean } }[]
    try {
      list = await getJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(mc)}`, signal)
    } catch (err) {
      if (err instanceof HttpError && err.status < 500) return []
      throw err
    }
    const stable = list.filter((l) => l.loader.stable)
    const rest = list.filter((l) => !l.loader.stable)
    return [...stable, ...rest].map((l) => ({
      id: l.loader.version,
      label: `Loader ${l.loader.version}${l.loader.stable ? '' : ' (beta)'}`
    }))
  },
  async install(ic) {
    const loader = await firstOrChosen(fabric, ic, 'Fabric')
    const installer = (await fabricInstallers()).find((i) => i.stable) ?? (await fabricInstallers())[0]
    // Fetch the vanilla jar ourselves so the first start doesn't have to.
    await downloadVanillaJar(ic, 'server.jar')
    ic.ctx.step('Downloading Fabric')
    await download({
      url: `${FABRIC_META}/versions/loader/${encodeURIComponent(ic.mcVersion)}/${loader}/${installer.version}/server/jar`,
      dest: join(ic.serverDir, 'fabric-server-launch.jar'),
      signal: ic.ctx.signal,
      onProgress: (done, total) => ic.ctx.bytes(done, total)
    })
    await writeFile(join(ic.serverDir, 'fabric-server-launcher.properties'), 'serverJar=server.jar\n')
    return { launch: { kind: 'jar', jar: 'fabric-server-launch.jar' }, loaderVersion: loader }
  }
}

// ---------------------------------------------------------------- Forge & NeoForge

/** Runs an installer jar, turning its console chatter into task progress. */
function runInstaller(
  javaPath: string,
  args: string[],
  cwd: string,
  ctx: TaskContext,
  name: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(javaPath, args, { cwd, windowsHide: true })
    const tail: string[] = []
    let libraries = 0
    const onData = (buf: Buffer): void => {
      for (const raw of buf.toString('utf8').split(/\r?\n/)) {
        const line = raw.trim()
        if (!line) continue
        tail.push(line)
        if (tail.length > 40) tail.shift()
        if (/^(Downloading|Considering) library/i.test(line)) {
          libraries++
          ctx.progress(null, `Setting up libraries (${libraries})`)
        } else if (/processor|task:|splitting|patching|extracting/i.test(line)) {
          ctx.progress(null, `Preparing ${name} (this can take a few minutes)`)
        }
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    const abort = (): void => void child.kill()
    ctx.signal.addEventListener('abort', abort, { once: true })
    child.on('error', reject)
    child.on('close', (code) => {
      ctx.signal.removeEventListener('abort', abort)
      if (ctx.signal.aborted) return reject(new Error('Cancelled'))
      if (code === 0) return resolve()
      log.error(`${name} installer exited ${code}:\n${tail.join('\n')}`)
      const reason = [...tail].reverse().find((l) => /error|fail|exception/i.test(l)) ?? tail.at(-1)
      reject(new Error(`The ${name} installer failed${reason ? `: ${reason}` : '.'}`))
    })
  })
}

/** Finds how to start a freshly installed Forge/NeoForge server. */
export async function detectForgeLaunch(serverDir: string): Promise<LaunchSpec> {
  const argsFile = process.platform === 'win32' ? 'win_args.txt' : 'unix_args.txt'
  for (const base of [
    'libraries/net/minecraftforge/forge',
    'libraries/net/neoforged/neoforge',
    'libraries/net/neoforged/forge'
  ]) {
    const dir = join(serverDir, ...base.split('/'))
    if (!existsSync(dir)) continue
    for (const ver of await readdir(dir)) {
      if (existsSync(join(dir, ver, argsFile))) return { kind: 'argsfile', dir: `${base}/${ver}` }
    }
  }
  // Minecraft 1.16.5 and older: a runnable forge jar in the server folder.
  const jars = (await readdir(serverDir)).filter(
    (f) => /^(forge|neoforge)-.*\.jar$/i.test(f) && !/installer/i.test(f)
  )
  const pick = jars.find((j) => /universal/i.test(j)) ?? jars.sort((a, b) => a.length - b.length)[0]
  if (pick) return { kind: 'jar', jar: pick }
  throw new Error("The installer finished but the server files weren't found.")
}

async function sha1For(url: string, signal: AbortSignal): Promise<Checksum | undefined> {
  try {
    const hex = (await getText(`${url}.sha1`, signal)).trim().slice(0, 40)
    return /^[0-9a-f]{40}$/i.test(hex) ? { algorithm: 'sha1', hex } : undefined
  } catch {
    return undefined
  }
}

async function installWithInstaller(
  ic: InstallContext,
  name: string,
  installerUrl: string,
  args: string[]
): Promise<LaunchSpec> {
  // Old installers fetch the vanilla jar from a Mojang address that no longer exists,
  // so place it where they expect it first.
  if (!(await isAtLeast(ic.mojang, ic.mcVersion, '1.13'))) {
    await downloadVanillaJar(ic, `minecraft_server.${ic.mcVersion}.jar`)
  }
  const installer = join(ic.serverDir, `${name.toLowerCase()}-installer.jar`)
  ic.ctx.step(`Downloading the ${name} installer`)
  await download({
    url: installerUrl,
    dest: installer,
    checksum: await sha1For(installerUrl, ic.ctx.signal),
    signal: ic.ctx.signal,
    onProgress: (done, total) => ic.ctx.bytes(done, total)
  })
  ic.ctx.step(`Installing ${name} (this can take a few minutes)`)
  await runInstaller(ic.javaPath, ['-jar', installer, ...args], ic.serverDir, ic.ctx, name)
  await rm(installer, { force: true })
  await rm(`${installer}.log`, { force: true })
  // Forge writes run.bat/run.sh for manual use; we start the server ourselves but leave them.
  return detectForgeLaunch(ic.serverDir)
}

const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge'

const forgeAll = cached(60 * 60 * 1000, async () => {
  const xml = await getText(`${FORGE_MAVEN}/maven-metadata.xml`)
  return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
})
const forgePromos = cached(60 * 60 * 1000, () =>
  getJson<{ promos: Record<string, string> }>(
    'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
  )
)

const forge: LoaderModule = {
  async versions(mc) {
    const [all, { promos }] = await Promise.all([forgeAll(), forgePromos()])
    const recommended = promos[`${mc}-recommended`]
    const latest = promos[`${mc}-latest`]
    const matching = all
      .filter((v) => v.startsWith(`${mc}-`))
      .map((id) => {
        // "1.7.10-10.13.4.1614-1.7.10" -> "10.13.4.1614"
        const forgeVer = id.slice(mc.length + 1).replace(new RegExp(`-${mc.replace(/\./g, '\\.')}$`), '')
        return { id, forgeVer }
      })
      .reverse()
    const tag = (v: string): string =>
      v === recommended ? ' (recommended)' : v === latest ? ' (latest)' : ''
    const preferred = matching.find((m) => m.forgeVer === recommended) ?? matching[0]
    return [
      ...(preferred ? [preferred] : []),
      ...matching.filter((m) => m !== preferred)
    ].map((m) => ({ id: m.id, label: `${m.forgeVer}${tag(m.forgeVer)}` }))
  },
  async install(ic) {
    const id = await firstOrChosen(forge, ic, 'Forge')
    const launch = await installWithInstaller(
      ic,
      'Forge',
      `${FORGE_MAVEN}/${id}/forge-${id}-installer.jar`,
      ['--installServer']
    )
    return { launch, loaderVersion: id }
  }
}

const NEO_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged'
const NEO_API = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged'

/** NeoForge "21.1.77" targets Minecraft 1.21.1; "26.3.0.16-beta" targets 26.3. */
export function neoForgeTargetsMc(version: string): string | null {
  const parts = version.split('-')[0].split('.').map(Number)
  if (parts.length < 3 || parts.some(Number.isNaN)) return null
  if (parts[0] >= 26) return `${parts[0]}.${parts[1]}${parts[2] ? `.${parts[2]}` : ''}`
  if (parts[0] >= 20) return `1.${parts[0]}${parts[1] ? `.${parts[1]}` : ''}`
  return null
}

const neoAll = cached(60 * 60 * 1000, async () => {
  const [modern, legacy] = await Promise.all([
    getJson<{ versions: string[] }>(`${NEO_API}/neoforge`),
    getJson<{ versions: string[] }>(`${NEO_API}/forge`)
  ])
  return { modern: modern.versions, legacy: legacy.versions }
})

function compareDotted(a: string, b: string): number {
  const pa = a.split('-')[0].split('.').map(Number)
  const pb = b.split('-')[0].split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

const neoforge: LoaderModule = {
  async versions(mc) {
    const { modern, legacy } = await neoAll()
    // 1.20.1 NeoForge was published under the old "forge" name.
    const list =
      mc === '1.20.1'
        ? legacy.filter((v) => v.startsWith('1.20.1-')).map((v) => ({ id: v, shown: v.slice(7) }))
        : modern.filter((v) => neoForgeTargetsMc(v) === mc).map((v) => ({ id: v, shown: v }))
    const sorted = list.sort((a, b) => compareDotted(b.shown, a.shown))
    const stable = sorted.filter((v) => !/beta|alpha/i.test(v.id))
    const rest = sorted.filter((v) => /beta|alpha/i.test(v.id))
    return [...stable, ...rest].map((v) => ({
      id: v.id,
      label: v.shown.replace(/-beta$/, ' (beta)')
    }))
  },
  async install(ic) {
    const id = await firstOrChosen(neoforge, ic, 'NeoForge')
    const url = id.startsWith('1.20.1-')
      ? `${NEO_MAVEN}/forge/${id}/forge-${id}-installer.jar`
      : `${NEO_MAVEN}/neoforge/${id}/neoforge-${id}-installer.jar`
    const launch = await installWithInstaller(ic, 'NeoForge', url, ['--install-server', '.'])
    return { launch, loaderVersion: id }
  }
}

export const LOADERS: Record<ManagedLoader, LoaderModule> = {
  vanilla,
  paper,
  fabric,
  forge,
  neoforge
}
