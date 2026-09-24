import yauzl from 'yauzl'

/** Small read-only helpers for looking inside jars and zips without extracting them. */

export type ZipSource = string | Buffer

function open(src: ZipSource): Promise<yauzl.ZipFile> {
  return new Promise((ok, fail) => {
    const cb = (err: Error | null, zip?: yauzl.ZipFile): void => (err || !zip ? fail(err) : ok(zip))
    if (typeof src === 'string') yauzl.open(src, { lazyEntries: true, autoClose: false }, cb)
    else yauzl.fromBuffer(src, { lazyEntries: true }, cb)
  })
}

export async function listEntries(src: ZipSource): Promise<string[]> {
  const zip = await open(src)
  const names: string[] = []
  try {
    await new Promise<void>((ok, fail) => {
      zip.on('entry', (e: yauzl.Entry) => {
        names.push(e.fileName)
        zip.readEntry()
      })
      zip.on('end', ok)
      zip.on('error', fail)
      zip.readEntry()
    })
  } finally {
    zip.close()
  }
  return names
}

/** Reads one entry fully into memory (only for small files like manifests and level.dat). */
export async function readEntry(src: ZipSource, name: string, maxBytes = 16 * 1024 * 1024): Promise<Buffer | null> {
  const zip = await open(src)
  try {
    return await new Promise<Buffer | null>((ok, fail) => {
      zip.on('entry', (e: yauzl.Entry) => {
        if (e.fileName !== name) return zip.readEntry()
        if (e.uncompressedSize > maxBytes) return ok(null)
        zip.openReadStream(e, (err, stream) => {
          if (err || !stream) return fail(err)
          const chunks: Buffer[] = []
          stream.on('data', (c: Buffer) => chunks.push(c))
          stream.on('end', () => ok(Buffer.concat(chunks)))
          stream.on('error', fail)
        })
      })
      zip.on('end', () => ok(null))
      zip.on('error', fail)
      zip.readEntry()
    })
  } finally {
    zip.close()
  }
}
