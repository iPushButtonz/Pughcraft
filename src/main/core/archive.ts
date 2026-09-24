import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, stat } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import yauzl from 'yauzl'
import * as tar from 'tar'

type Progress = (done: number, total: number) => void

/** Refuses entries like `../../evil` that would land outside the target folder. */
function safeJoin(root: string, entry: string): string {
  const target = resolve(root, entry)
  if (target !== resolve(root) && !target.startsWith(resolve(root) + sep)) {
    throw new Error(`Archive entry escapes the target folder: ${entry}`)
  }
  return target
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((ok, fail) =>
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zip) =>
      err || !zip ? fail(err) : ok(zip)
    )
  )
}

/** Extracts a .zip into `dest`, reporting progress by uncompressed bytes. */
export async function extractZip(
  file: string,
  dest: string,
  opts: { signal?: AbortSignal; onProgress?: Progress } = {}
): Promise<void> {
  const zip = await openZip(file)
  let total = 0
  let done = 0
  // yauzl reads the central directory up front, so the total is known once entries are listed.
  const entries: yauzl.Entry[] = []
  await new Promise<void>((ok, fail) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      entries.push(entry)
      total += entry.uncompressedSize
      zip.readEntry()
    })
    zip.on('end', ok)
    zip.on('error', fail)
    zip.readEntry()
  })

  const zip2 = await openZip(file)
  try {
    for (const entry of entries) {
      if (opts.signal?.aborted) throw new Error('Cancelled')
      const target = safeJoin(dest, entry.fileName)
      if (entry.fileName.endsWith('/')) {
        await mkdir(target, { recursive: true })
        continue
      }
      await mkdir(dirname(target), { recursive: true })
      const stream = await new Promise<NodeJS.ReadableStream>((ok, fail) =>
        zip2.openReadStream(entry, (err, s) => (err || !s ? fail(err) : ok(s)))
      )
      const counter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          done += chunk.length
          opts.onProgress?.(done, total)
          cb(null, chunk)
        }
      })
      await pipeline(stream, counter, createWriteStream(target), { signal: opts.signal })
    }
  } finally {
    zip2.close()
  }
}

/** Extracts a .tar or .tar.gz into `dest` (tar detects gzip itself), reporting progress by bytes read. */
export async function extractTarGz(
  file: string,
  dest: string,
  opts: { signal?: AbortSignal; onProgress?: Progress } = {}
): Promise<void> {
  await mkdir(dest, { recursive: true })
  const total = (await stat(file)).size
  let done = 0
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      done += chunk.length
      opts.onProgress?.(done, total)
      cb(null, chunk)
    }
  })
  // tar strips absolute paths and `..` entries by default.
  await pipeline(createReadStream(file), counter, tar.x({ cwd: dest }), { signal: opts.signal })
}

/** Picks the format from the file's first bytes, not its name (.mrpack and .jar are zips). */
export async function extractArchive(
  file: string,
  dest: string,
  opts: { signal?: AbortSignal; onProgress?: Progress } = {}
): Promise<void> {
  const handle = await open(file, 'r')
  const head = Buffer.alloc(4)
  try {
    await handle.read(head, 0, 4, 0)
  } finally {
    await handle.close()
  }
  const isZip = head[0] === 0x50 && head[1] === 0x4b // "PK"
  return isZip ? extractZip(file, dest, opts) : extractTarGz(file, dest, opts)
}
