import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { TaskContext } from '../tasks'
import { download } from '../core/http'
import { extractArchive } from '../core/archive'
import { logger } from '../log'

const log = logger('bore')

/**
 * bore (Advanced option): an open-source tunnel that needs no account. The public relay
 * bore.pub is a hobby service with no uptime promise, and the address changes every start.
 */

const VERSION = '0.6.0'
/**
 * No Windows build on purpose: Windows Defender flags bore as a trojan (a false positive
 * common for tunnel tools), so the option is hidden there (SPEC §7.2).
 */
const BUILDS: Partial<Record<string, { file: string; sha256: string }>> = {
  'linux-x64': {
    file: `bore-v${VERSION}-x86_64-unknown-linux-musl.tar.gz`,
    sha256: 'e484d1e3acba77169b773f31a5bfb34192d4b660f44a094a658a2522cd2270f7'
  },
  'linux-arm64': {
    file: `bore-v${VERSION}-aarch64-unknown-linux-musl.tar.gz`,
    sha256: 'ffc4515f3617420b243758cf36ed6a63208d7dba76b2ec3e90d1f476a9742951'
  }
}

export const DEFAULT_BORE_RELAY = 'bore.pub'

export class BoreManager {
  private readonly running = new Map<string, ChildProcess>()

  constructor(private readonly toolsDir: string) {}

  static get supported(): boolean {
    return !!BUILDS[`${process.platform}-${process.arch}`]
  }

  private get exe(): string {
    return join(this.toolsDir, `bore-${VERSION}${process.platform === 'win32' ? '.exe' : ''}`)
  }

  async ensure(ctx: TaskContext): Promise<void> {
    if (existsSync(this.exe)) return
    const build = BUILDS[`${process.platform}-${process.arch}`]
    if (!build) throw new Error('bore has no download for this kind of PC.')
    await mkdir(this.toolsDir, { recursive: true })
    const archive = join(this.toolsDir, build.file)
    ctx.step('Downloading bore')
    await download({
      url: `https://github.com/ekzhang/bore/releases/download/v${VERSION}/${build.file}`,
      dest: archive,
      checksum: { algorithm: 'sha256', hex: build.sha256 },
      signal: ctx.signal,
      onProgress: (d, t) => ctx.bytes(d, t)
    })
    const staging = join(this.toolsDir, '.bore-staging')
    await rm(staging, { recursive: true, force: true })
    await extractArchive(archive, staging)
    const name = (await readdir(staging)).find((f) => /^bore(\.exe)?$/.test(f))
    if (!name) throw new Error('The bore download did not contain the program.')
    await rename(join(staging, name), this.exe)
    if (process.platform !== 'win32') await chmod(this.exe, 0o755)
    await rm(staging, { recursive: true, force: true })
    await rm(archive, { force: true })
  }

  /** Starts a tunnel for `port` and resolves with the public address bore prints. */
  start(key: string, port: number, relay = DEFAULT_BORE_RELAY): Promise<string> {
    this.stop(key)
    return new Promise((resolve, reject) => {
      if (!existsSync(this.exe)) return reject(new Error('bore is not downloaded yet.'))
      const child = spawn(this.exe, ['local', String(port), '--to', relay], { windowsHide: true })
      this.running.set(key, child)
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          this.stop(key)
          reject(new Error(`The relay ${relay} did not answer.`))
        }
      }, 20_000)
      const onData = (buf: Buffer): void => {
        const text = buf.toString('utf8').replace(/\x1b\[[0-9;]*m/g, '')
        const m = /listening at ([^\s]+:\d+)/i.exec(text)
        if (m && !settled) {
          settled = true
          clearTimeout(timer)
          resolve(m[1])
        }
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      child.on('exit', (code) => {
        if (this.running.get(key) === child) this.running.delete(key)
        log.info(`bore for ${key} exited (${code})`)
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(new Error(`bore stopped before connecting (exit ${code}).`))
        }
      })
    })
  }

  stop(key: string): void {
    this.running.get(key)?.kill()
    this.running.delete(key)
  }

  stopAll(): void {
    for (const key of [...this.running.keys()]) this.stop(key)
  }
}
