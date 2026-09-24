import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TaskContext } from '../tasks'
import { download, getJson } from './http'
import { extractArchive } from './archive'
import { logger } from '../log'

const log = logger('java')

/** Java majors Eclipse Temurin publishes JREs for. Minecraft never needs anything else. */
const TEMURIN_MAJORS = [8, 11, 17, 21, 25]

/** Minecraft asks for e.g. Java 16 (1.17); run it on the nearest available LTS at or above. */
export function temurinMajorFor(required: number): number {
  if (required <= 8) return 8
  return TEMURIN_MAJORS.find((m) => m >= required) ?? TEMURIN_MAJORS[TEMURIN_MAJORS.length - 1]
}

const javaExe = (dir: string): string =>
  join(dir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')

interface Marker {
  major: number
  version: string
}

interface AdoptiumAsset {
  binary: { package: { link: string; checksum: string; name: string; size: number } }
  release_name: string
}

export class JavaManager {
  private readonly inFlight = new Map<number, Promise<string>>()

  constructor(private readonly root: string) {}

  /** Managed runtimes on disk, e.g. [{ major: 21, version: 'jdk-21.0.12+1', path }]. */
  async installed(): Promise<(Marker & { path: string })[]> {
    if (!existsSync(this.root)) return []
    const out: (Marker & { path: string })[] = []
    for (const name of await readdir(this.root)) {
      const dir = join(this.root, name)
      try {
        const marker = JSON.parse(await readFile(join(dir, 'pughcraft-java.json'), 'utf8')) as Marker
        if (existsSync(javaExe(dir))) out.push({ ...marker, path: javaExe(dir) })
      } catch {
        // Not one of ours, or a half-finished install.
      }
    }
    return out
  }

  /** Returns a java executable for `requiredMajor`, downloading Temurin if needed. */
  ensure(requiredMajor: number, ctx: TaskContext): Promise<string> {
    const major = temurinMajorFor(requiredMajor)
    let job = this.inFlight.get(major)
    if (!job) {
      job = this.ensureMajor(major, ctx).finally(() => this.inFlight.delete(major))
      this.inFlight.set(major, job)
    }
    return job
  }

  private async ensureMajor(major: number, ctx: TaskContext): Promise<string> {
    const existing = (await this.installed()).find((j) => j.major === major)
    if (existing) return existing.path

    ctx.step(`Getting Java ${major}`)
    const os = process.platform === 'win32' ? 'windows' : 'linux'
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'
    const url = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=${arch}&image_type=jre&os=${os}&vendor=eclipse`
    const [asset] = await getJson<AdoptiumAsset[]>(url, ctx.signal)
    if (!asset) throw new Error(`No Java ${major} download is available for this PC.`)

    const pkg = asset.binary.package
    await mkdir(this.root, { recursive: true })
    const archive = join(this.root, pkg.name)
    ctx.step(`Downloading Java ${major}`)
    await download({
      url: pkg.link,
      dest: archive,
      checksum: { algorithm: 'sha256', hex: pkg.checksum },
      signal: ctx.signal,
      onProgress: (done, total) => ctx.bytes(done, total ?? pkg.size)
    })

    ctx.step(`Unpacking Java ${major}`)
    const staging = join(this.root, `.staging-${major}`)
    await rm(staging, { recursive: true, force: true })
    await extractArchive(archive, staging, {
      signal: ctx.signal,
      onProgress: (done, total) => ctx.progress(done / total)
    })
    // Archives hold a single top folder like `jdk-21.0.12+1-jre`.
    const [top] = await readdir(staging)
    const extracted = join(staging, top)
    if (!existsSync(javaExe(extracted))) throw new Error('The Java download did not contain java.')

    const finalDir = join(this.root, `temurin-${major}`)
    await rm(finalDir, { recursive: true, force: true })
    await rename(extracted, finalDir)
    await writeFile(
      join(finalDir, 'pughcraft-java.json'),
      JSON.stringify({ major, version: asset.release_name } satisfies Marker, null, 2)
    )
    await rm(staging, { recursive: true, force: true })
    await rm(archive, { force: true })
    log.info(`installed Java ${asset.release_name}`)
    return javaExe(finalDir)
  }
}
