import { existsSync } from 'node:fs'
import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { DetectedMod, ImportAnalysis } from '@shared/imports'
import type { LaunchSpec, Loader } from '@shared/servers'
import type { TaskContext } from '../tasks'
import type { MojangMeta } from '../core/mojang'
import { extractArchive } from '../core/archive'
import { dirSize } from '../core/fsutil'
import { detectForgeLaunch, neoForgeTargetsMc } from '../core/loaders'
import { PropertiesFile } from '../servers/properties'
import { listEntries, readEntry } from './zipread'
import { loaderFromBrands, readLevelDat } from './leveldat'
import { duplicateMods, missingDependencies, scanModsFolder, type ScannedMod } from './mods'

/** Everything the importer needs besides what the review screen shows. */
export interface AnalysisDetails {
  analysis: ImportAnalysis
  /** Folder to import from (the original, or the extracted copy of an archive). */
  root: string
  /** For worlds: the folder containing level.dat. For instances: the game folder. */
  contentRoot: string
  /** True when `root` is our own extracted copy and may be moved instead of copied. */
  staged: boolean
  launch: LaunchSpec | null
  mods: ScannedMod[]
  mrpack: MrpackIndex | null
}

export interface MrpackFile {
  path: string
  hashes: { sha1?: string; sha512?: string }
  env?: { client?: string; server?: string }
  downloads: string[]
  fileSize?: number
}

export interface MrpackIndex {
  name: string
  versionId: string
  files: MrpackFile[]
  dependencies: Record<string, string>
}

type Ctx = { ctx: TaskContext; stagingDir: string; mojang: MojangMeta; id: string }

const SERVER_MARKERS = ['server.properties', 'eula.txt', 'user_jvm_args.txt', 'run.bat', 'run.sh', 'libraries']

function emptyAnalysis(id: string, sourcePath: string): ImportAnalysis {
  return {
    id,
    sourcePath,
    sourceLabel: basename(sourcePath),
    kind: 'world',
    name: basename(sourcePath).replace(/\.(zip|mrpack|tar\.gz|tgz)$/i, ''),
    mcVersion: null,
    loader: null,
    loaderVersion: null,
    world: null,
    mods: [],
    plugins: [],
    worlds: [],
    sizeBytes: 0,
    problems: [],
    warnings: [],
    missingDependencies: [],
    duplicateCopies: 0
  }
}

/** How many extra copies would be left out (a mod there 3 times counts 2). */
function extraCopies(mods: ScannedMod[]): number {
  const counts = new Map<string, number>()
  for (const m of mods) if (m.id && m.side !== 'client') counts.set(m.id, (counts.get(m.id) ?? 0) + 1)
  return [...counts.values()].reduce((n, c) => n + (c - 1), 0)
}

function blocked(a: ImportAnalysis, reason: string): AnalysisDetails {
  a.problems.push(reason)
  return { analysis: a, root: a.sourcePath, contentRoot: a.sourcePath, staged: false, launch: null, mods: [], mrpack: null }
}

const publicMods = (mods: ScannedMod[]): DetectedMod[] =>
  mods.map(({ file, id, name, version, loader, side, sideSource }) => ({ file, id, name, version, loader, side, sideSource }))

/** Works out what `sourcePath` is and everything needed to import it. */
export async function analyzeSource(sourcePath: string, c: Ctx): Promise<AnalysisDetails> {
  const a = emptyAnalysis(c.id, sourcePath)
  const info = await stat(sourcePath)
  if (info.isDirectory()) return analyzeDir(sourcePath, a, c, false)

  const ext = extname(sourcePath).toLowerCase()
  if (ext === '.mcworld' || ext === '.mcpack') {
    return blocked(a, 'This is a Bedrock Edition world. Pughcraft only runs Minecraft: Java Edition servers.')
  }
  if (ext === '.jar') {
    return blocked(a, 'This is a single mod or server file. Drop a whole world, server folder or modpack instead.')
  }
  const isTar = /\.(tar\.gz|tgz|gz|tar)$/i.test(sourcePath)
  if (!isTar) {
    let entries: string[]
    try {
      entries = await listEntries(sourcePath)
    } catch {
      return blocked(a, "This file isn't a zip Pughcraft can read.")
    }
    if (entries.includes('modrinth.index.json')) {
      const staged = await extract(sourcePath, c)
      return analyzeMrpack(staged, a, c)
    }
    if (entries.includes('manifest.json')) {
      const manifest = JSON.parse((await readEntry(sourcePath, 'manifest.json'))!.toString('utf8')) as {
        manifestType?: string
        name?: string
      }
      if (manifest.manifestType === 'minecraftModpack') {
        a.kind = 'curseforge'
        a.name = manifest.name ?? a.name
        return blocked(
          a,
          "CurseForge modpacks need a connection to CurseForge that isn't set up in this version yet. Tip: on the modpack's CurseForge page, open Files and download its Server Pack, then drop that zip here instead."
        )
      }
    }
    if (entries.some((e) => /(^|\/)db\/$/.test(e)) && entries.some((e) => e.endsWith('levelname.txt'))) {
      return blocked(a, 'This is a Bedrock Edition world. Pughcraft only runs Minecraft: Java Edition servers.')
    }
    const looksUseful =
      entries.some((e) => /(^|\/)level\.dat$/.test(e)) ||
      entries.some((e) => SERVER_MARKERS.some((m) => e === m || e.endsWith(`/${m}`) || e.startsWith(`${m}/`)))
    if (!looksUseful) {
      return blocked(a, "Pughcraft couldn't find a world, server or modpack inside this zip.")
    }
  }
  const staged = await extract(sourcePath, c)
  return analyzeDir(staged, a, c, true)
}

async function extract(sourcePath: string, c: Ctx): Promise<string> {
  const dest = join(c.stagingDir, c.id)
  await rm(dest, { recursive: true, force: true })
  c.ctx.step(`Unpacking ${basename(sourcePath)}`)
  await extractArchive(sourcePath, dest, {
    signal: c.ctx.signal,
    onProgress: (d, t) => c.ctx.progress(t ? d / t : null)
  })
  return dest
}

/** Descends through wrapper folders that hold nothing but one sub-folder. */
async function unwrap(dir: string): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const entries = (await readdir(dir, { withFileTypes: true })).filter((e) => !e.name.startsWith('__MACOSX'))
    if (entries.length === 1 && entries[0].isDirectory()) dir = join(dir, entries[0].name)
    else break
  }
  return dir
}

async function analyzeDir(dir: string, a: ImportAnalysis, c: Ctx, staged: boolean): Promise<AnalysisDetails> {
  const root = await unwrap(dir)
  const has = (name: string): boolean => existsSync(join(root, name))

  if (has('db') && has('levelname.txt')) {
    return blocked(a, 'This is a Bedrock Edition world. Pughcraft only runs Minecraft: Java Edition servers.')
  }
  if (has('launcher_profiles.json') && has('saves')) {
    return blocked(a, 'This is a whole Minecraft folder. Pick one world from the list below (or from its "saves" folder) instead.')
  }
  if (has('instance.cfg') || has('mmc-pack.json') || has('minecraftinstance.json') || has('profile.json')) {
    return analyzeInstance(root, a, c, staged)
  }
  if (has('level.dat') && !SERVER_MARKERS.some(has)) return analyzeWorld(root, a, c, staged)
  if (SERVER_MARKERS.some(has) || (await readdir(root)).some((f) => f.endsWith('.jar'))) {
    return analyzeServer(root, a, c, staged)
  }
  if (has('mods') && (has('saves') || has('config'))) return analyzeInstance(root, a, c, staged)
  return blocked(a, "Pughcraft couldn't find a world, server or modpack in this folder.")
}

// ------------------------------------------------------------------ worlds

async function analyzeWorld(root: string, a: ImportAnalysis, c: Ctx, staged: boolean): Promise<AnalysisDetails> {
  a.kind = 'world'
  c.ctx.step('Reading the world')
  const level = await readLevelDat(await readFile(join(root, 'level.dat')))
  a.name = level.levelName
  a.sizeBytes = await dirSize(root)
  a.world = { levelName: level.levelName, sizeBytes: a.sizeBytes, brands: level.brands, wasModded: level.wasModded }
  a.mcVersion = level.versionName && (await c.mojang.releaseTime(level.versionName)) ? level.versionName : null
  if (!a.mcVersion) {
    a.warnings.push("This world doesn't say which Minecraft version it's from (it's older than 1.9). Pick the version it was played on.")
  }
  const brand = loaderFromBrands(level.brands)
  a.loader = brand === 'quilt' ? 'fabric' : (brand ?? 'vanilla')
  if (level.wasModded && brand && brand !== 'vanilla' && brand !== 'paper') {
    a.warnings.push(
      `This world was last played with ${brand === 'neoforge' ? 'NeoForge' : brand[0].toUpperCase() + brand.slice(1)} mods. If they added new blocks or items, put the same mods on the server, or those things will disappear.`
    )
  }
  return { analysis: a, root, contentRoot: root, staged, launch: null, mods: [], mrpack: null }
}

// ------------------------------------------------------------------ server folders

async function readJarVersion(jar: string): Promise<string | null> {
  try {
    const raw = await readEntry(jar, 'version.json')
    if (!raw) return null
    const v = JSON.parse(raw.toString('utf8')) as { id?: string; name?: string }
    return v.id ?? v.name ?? null
  } catch {
    return null
  }
}

async function detectServerSoftware(root: string, mojang: MojangMeta): Promise<{
  loader: Exclude<Loader, never>
  loaderVersion: string | null
  mcVersion: string | null
  launch: LaunchSpec | null
}> {
  const files = await readdir(root)
  const lib = (p: string): string => join(root, 'libraries', ...p.split('/'))
  const firstDir = async (p: string): Promise<string | null> => {
    try {
      return (await readdir(p))[0] ?? null
    } catch {
      return null
    }
  }
  const forgeLaunch = async (): Promise<LaunchSpec | null> => detectForgeLaunch(root).catch(() => null)

  const neo = await firstDir(lib('net/neoforged/neoforge'))
  if (neo) return { loader: 'neoforge', loaderVersion: neo, mcVersion: neoForgeTargetsMc(neo), launch: await forgeLaunch() }
  const neoLegacy = await firstDir(lib('net/neoforged/forge'))
  if (neoLegacy) return { loader: 'neoforge', loaderVersion: neoLegacy, mcVersion: '1.20.1', launch: await forgeLaunch() }
  const forgeLib = await firstDir(lib('net/minecraftforge/forge'))
  const forgeJar = files.find((f) => /^forge-.+\.jar$/i.test(f) && !/installer/i.test(f))
  if (forgeLib || forgeJar) {
    const full = forgeLib ?? forgeJar!.replace(/^forge-/i, '').replace(/(-universal)?\.jar$/i, '')
    return {
      loader: 'forge',
      loaderVersion: full,
      mcVersion: full.split('-')[0] || null,
      launch: await forgeLaunch()
    }
  }
  if (files.includes('fabric-server-launch.jar') || files.includes('.fabric') || files.includes('fabric-server-launcher.properties')) {
    const loaderVersion = await firstDir(lib('net/fabricmc/fabric-loader'))
    const vanillaJar = files.find((f) => f === 'server.jar') ?? null
    const launchJar = files.find((f) => /^fabric-server-(launch|mc\..*launcher.*)\.jar$/i.test(f)) ?? null
    return {
      loader: 'fabric',
      loaderVersion,
      mcVersion: vanillaJar ? await readJarVersion(join(root, vanillaJar)) : null,
      launch: launchJar ? { kind: 'jar', jar: launchJar } : null
    }
  }
  const paper = files.find((f) => /^paper-.+\.jar$/i.test(f))
  if (paper) {
    const m = /^paper-(.+?)-(\d+)\.jar$/i.exec(paper)
    return { loader: 'paper', loaderVersion: m?.[2] ?? null, mcVersion: m?.[1] ?? null, launch: { kind: 'jar', jar: paper } }
  }
  const vanilla = files.find((f) => f === 'server.jar' || /^minecraft_server.*\.jar$/i.test(f))
  if (vanilla) {
    const mc = await readJarVersion(join(root, vanilla))
    return { loader: 'vanilla', loaderVersion: null, mcVersion: mc, launch: { kind: 'jar', jar: vanilla } }
  }
  // Purpur, Spigot and friends: run whatever jar is there, but don't manage it.
  const other = files.filter((f) => f.endsWith('.jar')).sort((x, y) => x.length - y.length)[0]
  const guess = other ? /(\d+\.\d+(?:\.\d+)?)/.exec(other)?.[1] ?? null : null
  return {
    loader: 'custom',
    loaderVersion: null,
    mcVersion: guess && (await mojang.releaseTime(guess)) ? guess : null,
    launch: other ? { kind: 'jar', jar: other } : null
  }
}

async function analyzeServer(root: string, a: ImportAnalysis, c: Ctx, staged: boolean): Promise<AnalysisDetails> {
  a.kind = 'server'
  c.ctx.step('Looking at the server files')
  const sw = await detectServerSoftware(root, c.mojang)
  a.loader = sw.loader
  a.loaderVersion = sw.loaderVersion
  a.mcVersion = sw.mcVersion
  const propsFile = join(root, 'server.properties')
  const props = existsSync(propsFile) ? PropertiesFile.parse(await readFile(propsFile, 'utf8')) : null
  const levelName = props?.get('level-name') || 'world'
  a.name = props?.get('motd')?.replace(/§./g, '').slice(0, 40) || a.name
  if (existsSync(join(root, levelName, 'level.dat'))) {
    const level = await readLevelDat(await readFile(join(root, levelName, 'level.dat')))
    a.world = { levelName: level.levelName, sizeBytes: 0, brands: level.brands, wasModded: level.wasModded }
    a.mcVersion ??= level.versionName
  }
  const mods = await scanMods(join(root, 'mods'), c)
  a.mods = publicMods(mods)
  a.missingDependencies = missingDependencies(mods.filter((m) => m.side !== 'client'))
  const dupes = duplicateMods(mods)
  a.duplicateCopies = extraCopies(mods)
  if (dupes.length) a.warnings.push(`Two copies of: ${dupes.join(', ')}. The newest copy is kept and the others are set aside.`)
  if (existsSync(join(root, 'plugins'))) a.plugins = (await readdir(join(root, 'plugins'))).filter((f) => f.endsWith('.jar'))
  a.sizeBytes = await dirSize(root)
  if (sw.loader === 'custom') {
    a.warnings.push(
      sw.launch
        ? `Pughcraft doesn't recognise this server software (${sw.launch.kind === 'jar' ? sw.launch.jar : ''}). It will run it as-is but can't update it.`
        : "No server program was found in this folder. Pick the server type and version so Pughcraft can install it."
    )
  }
  if (!a.mcVersion) a.warnings.push("Couldn't tell which Minecraft version this server is. Please pick it.")
  if (!sw.launch && sw.loader !== 'custom') a.warnings.push('The server program is missing from this folder, so Pughcraft will install it.')
  return { analysis: a, root, contentRoot: root, staged, launch: sw.launch, mods, mrpack: null }
}

async function scanMods(modsDir: string, c: Ctx): Promise<ScannedMod[]> {
  if (!existsSync(modsDir)) return []
  c.ctx.step('Checking mods')
  return scanModsFolder(modsDir, (d, t) => c.ctx.progress(d / t, `${d} of ${t} mods`))
}

// ------------------------------------------------------------------ instances

interface InstanceMeta {
  gameDir: string
  mcVersion: string | null
  loader: Loader | 'quilt' | null
  loaderVersion: string | null
  name: string | null
}

async function readInstanceMeta(root: string): Promise<InstanceMeta> {
  const gameDir = existsSync(join(root, 'minecraft'))
    ? join(root, 'minecraft')
    : existsSync(join(root, '.minecraft'))
      ? join(root, '.minecraft')
      : root
  const meta: InstanceMeta = { gameDir, mcVersion: null, loader: null, loaderVersion: null, name: null }
  try {
    if (existsSync(join(root, 'mmc-pack.json'))) {
      const pack = JSON.parse(await readFile(join(root, 'mmc-pack.json'), 'utf8')) as { components?: { uid: string; version?: string }[] }
      for (const comp of pack.components ?? []) {
        if (comp.uid === 'net.minecraft') meta.mcVersion = comp.version ?? null
        if (comp.uid === 'net.fabricmc.fabric-loader') [meta.loader, meta.loaderVersion] = ['fabric', comp.version ?? null]
        if (comp.uid === 'net.minecraftforge') [meta.loader, meta.loaderVersion] = ['forge', comp.version ?? null]
        if (comp.uid === 'net.neoforged') [meta.loader, meta.loaderVersion] = ['neoforge', comp.version ?? null]
        if (comp.uid === 'org.quiltmc.quilt-loader') [meta.loader, meta.loaderVersion] = ['quilt', comp.version ?? null]
      }
      if (meta.loader === 'forge' && meta.mcVersion && meta.loaderVersion) meta.loaderVersion = `${meta.mcVersion}-${meta.loaderVersion}`
      const cfg = await readFile(join(root, 'instance.cfg'), 'utf8').catch(() => '')
      meta.name = /^name=(.+)$/m.exec(cfg)?.[1]?.trim() ?? null
    } else if (existsSync(join(root, 'minecraftinstance.json'))) {
      const inst = JSON.parse(await readFile(join(root, 'minecraftinstance.json'), 'utf8')) as {
        name?: string
        gameVersion?: string
        baseModLoader?: { name?: string }
      }
      meta.name = inst.name ?? null
      meta.mcVersion = inst.gameVersion ?? null
      const ml = inst.baseModLoader?.name ?? ''
      const m = /^(forge|neoforge|fabric|quilt)-(.+)$/i.exec(ml)
      if (m) {
        meta.loader = m[1].toLowerCase() as InstanceMeta['loader']
        meta.loaderVersion = meta.loader === 'forge' && meta.mcVersion ? `${meta.mcVersion}-${m[2]}` : m[2].split('-')[0]
      }
    } else if (existsSync(join(root, 'profile.json'))) {
      const p = JSON.parse(await readFile(join(root, 'profile.json'), 'utf8')) as {
        metadata?: { name?: string; game_version?: string; loader?: string; loader_version?: { id?: string } }
      }
      meta.name = p.metadata?.name ?? null
      meta.mcVersion = p.metadata?.game_version ?? null
      const l = p.metadata?.loader
      if (l && l !== 'vanilla') meta.loader = l as InstanceMeta['loader']
      meta.loaderVersion = p.metadata?.loader_version?.id ?? null
    }
  } catch {
    // Fall back to what the mods say.
  }
  return meta
}

async function analyzeInstance(root: string, a: ImportAnalysis, c: Ctx, staged: boolean): Promise<AnalysisDetails> {
  a.kind = 'instance'
  c.ctx.step('Reading the game instance')
  const meta = await readInstanceMeta(root)
  a.name = meta.name ?? a.name
  a.mcVersion = meta.mcVersion
  const mods = await scanMods(join(meta.gameDir, 'mods'), c)
  let loader = meta.loader
  if (!loader && mods.length) {
    const counts = new Map<string, number>()
    for (const m of mods) if (m.loader) counts.set(m.loader, (counts.get(m.loader) ?? 0) + 1)
    loader = ([...counts].sort((x, y) => y[1] - x[1])[0]?.[0] as InstanceMeta['loader']) ?? null
  }
  if (loader === 'quilt') {
    a.warnings.push("Quilt servers aren't supported yet. Fabric runs most Quilt mods, so Fabric is selected; check the mods still work.")
    loader = 'fabric'
    a.loaderVersion = null
  } else a.loaderVersion = meta.loaderVersion
  a.loader = loader ?? 'vanilla'
  a.mods = publicMods(mods)
  a.missingDependencies = missingDependencies(mods.filter((m) => m.side !== 'client'))
  const dupes = duplicateMods(mods)
  a.duplicateCopies = extraCopies(mods)
  if (dupes.length) a.warnings.push(`Two copies of: ${dupes.join(', ')}. The newest copy is kept and the others are left out.`)
  const saves = join(meta.gameDir, 'saves')
  if (existsSync(saves)) {
    for (const folder of await readdir(saves)) {
      const ld = join(saves, folder, 'level.dat')
      if (!existsSync(ld)) continue
      try {
        const level = await readLevelDat(await readFile(ld))
        a.worlds.push({ folder, levelName: level.levelName, mcVersion: level.versionName })
      } catch {
        // Skip unreadable worlds.
      }
    }
  }
  if (!a.mcVersion) a.warnings.push("Couldn't tell which Minecraft version this instance uses. Please pick it.")
  a.sizeBytes = await dirSize(join(meta.gameDir, 'mods'))
  return { analysis: a, root, contentRoot: meta.gameDir, staged, launch: null, mods, mrpack: null }
}

// ------------------------------------------------------------------ Modrinth packs

async function analyzeMrpack(dir: string, a: ImportAnalysis, c: Ctx): Promise<AnalysisDetails> {
  a.kind = 'mrpack'
  c.ctx.step('Reading the modpack')
  const index = JSON.parse(await readFile(join(dir, 'modrinth.index.json'), 'utf8')) as MrpackIndex
  a.name = index.name || a.name
  const deps = index.dependencies ?? {}
  a.mcVersion = deps.minecraft ?? null
  if (deps['fabric-loader']) [a.loader, a.loaderVersion] = ['fabric', deps['fabric-loader']]
  else if (deps.neoforge) [a.loader, a.loaderVersion] = ['neoforge', deps.neoforge]
  else if (deps.forge) [a.loader, a.loaderVersion] = ['forge', a.mcVersion ? `${a.mcVersion}-${deps.forge}` : deps.forge]
  else if (deps['quilt-loader']) {
    a.loader = 'fabric'
    a.warnings.push("This pack uses Quilt, which Pughcraft doesn't run yet. Fabric is selected instead; most Quilt mods work on it, but check.")
  } else a.loader = 'vanilla'

  // Files the pack itself marks as not for servers are simply not downloaded.
  const packMods: DetectedMod[] = index.files
    .filter((f) => f.path.startsWith('mods/'))
    .map((f) => ({
      file: basename(f.path),
      id: null,
      name: basename(f.path).replace(/\.jar$/i, ''),
      version: null,
      loader: null,
      side: f.env?.server === 'unsupported' ? 'client' : f.env?.client === 'unsupported' ? 'server' : 'both',
      sideSource: 'pack'
    }))
  // Mods shipped inside the pack's overrides still need checking.
  const extra: ScannedMod[] = []
  for (const sub of ['overrides/mods', 'server-overrides/mods']) {
    extra.push(...(await scanMods(join(dir, ...sub.split('/')), c)))
  }
  a.mods = [...packMods, ...publicMods(extra)]
  a.sizeBytes = index.files.reduce((n, f) => n + (f.fileSize ?? 0), 0)
  return { analysis: a, root: dir, contentRoot: dir, staged: true, launch: null, mods: extra, mrpack: index }
}
