import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { APP_NAME, REPO_URL } from '@shared/brand'
import { logger } from '../log'

const log = logger('http')

let appVersion = '0.0.0'
/** Defaults to Node's fetch; the app swaps in Electron's so system proxies are honoured. */
let fetchImpl: typeof fetch = (...args) => fetch(...args)

export function configureHttp(opts: { version: string; fetch?: typeof fetch }): void {
  appVersion = opts.version
  if (opts.fetch) fetchImpl = opts.fetch
}

/** Identifies us to Mojang, PaperMC, Modrinth etc. as their API rules ask. Never personal data. */
export function userAgent(): string {
  return `${APP_NAME}/${appVersion} (+${REPO_URL})`
}

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number
  ) {
    super(`${new URL(url).host} answered ${status}`)
    this.name = 'HttpError'
  }
}

async function request(url: string, signal?: AbortSignal): Promise<Response> {
  const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent() }, signal })
  if (!res.ok) throw new HttpError(url, res.status)
  return res
}

/** Retries network hiccups, damaged downloads and 5xx answers, but not 4xx or cancellation. */
async function withRetries<T>(
  what: string,
  signal: AbortSignal | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const delays = [500, 2000, 5000]
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const retryable = !signal?.aborted && !(err instanceof HttpError && err.status < 500)
      if (!retryable || attempt >= delays.length) throw err
      log.warn(`${what} failed (attempt ${attempt + 1}), retrying`, err)
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }
  }
}

export function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return withRetries(`GET ${url}`, signal, async () => (await request(url, signal)).json() as Promise<T>)
}

export function getText(url: string, signal?: AbortSignal): Promise<string> {
  return withRetries(`GET ${url}`, signal, async () => (await request(url, signal)).text())
}

export interface Checksum {
  algorithm: 'sha1' | 'sha256'
  hex: string
}

export class HashMismatchError extends Error {
  constructor(file: string) {
    super(`The downloaded file ${file} was damaged (checksum mismatch). Please try again.`)
    this.name = 'HashMismatchError'
  }
}

export async function hashFile(file: string, algorithm: Checksum['algorithm']): Promise<string> {
  const hash = createHash(algorithm)
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

async function fileMatches(file: string, checksum: Checksum | undefined): Promise<boolean> {
  try {
    await stat(file)
  } catch {
    return false
  }
  if (!checksum) return false
  return (await hashFile(file, checksum.algorithm)) === checksum.hex.toLowerCase()
}

export interface DownloadOptions {
  url: string
  dest: string
  checksum?: Checksum
  signal?: AbortSignal
  onProgress?: (done: number, total: number | null) => void
}

/**
 * Downloads to `dest` via a temp file, verifying the checksum when given.
 * Skips the download when `dest` already matches the checksum.
 */
export async function download(opts: DownloadOptions): Promise<void> {
  if (await fileMatches(opts.dest, opts.checksum)) return
  await mkdir(dirname(opts.dest), { recursive: true })
  const tmp = `${opts.dest}.part`

  await withRetries(`download ${opts.url}`, opts.signal, async () => {
    const res = await request(opts.url, opts.signal)
    const total = Number(res.headers.get('content-length')) || null
    let done = 0
    let lastReport = 0
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        done += chunk.length
        const now = Date.now()
        if (now - lastReport > 100) {
          lastReport = now
          opts.onProgress?.(done, total)
        }
        cb(null, chunk)
      }
    })
    if (!res.body) throw new Error(`empty response from ${opts.url}`)
    try {
      await pipeline(
        Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
        counter,
        createWriteStream(tmp),
        { signal: opts.signal }
      )
    } catch (err) {
      await rm(tmp, { force: true })
      throw err
    }
    opts.onProgress?.(done, total ?? done)
    if (opts.checksum && (await hashFile(tmp, opts.checksum.algorithm)) !== opts.checksum.hex.toLowerCase()) {
      await rm(tmp, { force: true })
      throw new HashMismatchError(opts.url.split('/').pop() ?? opts.url)
    }
  })
  await rename(tmp, opts.dest)
}
