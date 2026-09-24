import { Socket } from 'node:net'

/**
 * Minecraft "Server List Ping" (the request the Multiplayer screen sends), used to check
 * that a server really answers, not just that a port is open. Works for 1.7 and newer.
 */

export function writeVarInt(value: number): Buffer {
  const bytes: number[] = []
  let v = value >>> 0
  do {
    let byte = v & 0x7f
    v >>>= 7
    if (v !== 0) byte |= 0x80
    bytes.push(byte)
  } while (v !== 0)
  return Buffer.from(bytes)
}

/** Reads a VarInt at `offset`; returns null when the buffer doesn't hold all of it yet. */
export function readVarInt(buf: Buffer, offset = 0): { value: number; size: number } | null {
  let value = 0
  for (let i = 0; i < 5; i++) {
    if (offset + i >= buf.length) return null
    const byte = buf[offset + i]
    value |= (byte & 0x7f) << (7 * i)
    if ((byte & 0x80) === 0) return { value, size: i + 1 }
  }
  throw new Error('VarInt too long')
}

function packet(id: number, body: Buffer): Buffer {
  const content = Buffer.concat([writeVarInt(id), body])
  return Buffer.concat([writeVarInt(content.length), content])
}

export function handshakePacket(host: string, port: number): Buffer {
  const hostBytes = Buffer.from(host, 'utf8')
  const portBytes = Buffer.alloc(2)
  portBytes.writeUInt16BE(port)
  return packet(
    0x00,
    Buffer.concat([
      writeVarInt(-1), // "any version": servers still answer status requests
      writeVarInt(hostBytes.length),
      hostBytes,
      portBytes,
      writeVarInt(1) // next state: status
    ])
  )
}

export interface PingResult {
  online: boolean
  latencyMs?: number
  version?: string
  playersOnline?: number
  playersMax?: number
  motd?: string
  error?: string
}

function motdText(desc: unknown): string {
  if (typeof desc === 'string') return desc
  if (desc && typeof desc === 'object') {
    const d = desc as { text?: string; extra?: unknown[] }
    return (d.text ?? '') + (d.extra ?? []).map(motdText).join('')
  }
  return ''
}

export function pingServer(host: string, port: number, timeoutMs = 4000): Promise<PingResult> {
  return new Promise((resolve) => {
    const socket = new Socket()
    const started = Date.now()
    let data = Buffer.alloc(0)
    let settled = false
    const finish = (result: PingResult): void => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs, () => finish({ online: false, error: 'timed out' }))
    socket.on('error', (err: NodeJS.ErrnoException) => finish({ online: false, error: err.code ?? err.message }))
    socket.on('close', () => finish({ online: false, error: 'connection closed' }))
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk])
      const len = readVarInt(data)
      if (!len || data.length < len.size + len.value) return
      try {
        let offset = len.size
        const id = readVarInt(data, offset)!
        offset += id.size
        const strLen = readVarInt(data, offset)!
        offset += strLen.size
        const json = JSON.parse(data.subarray(offset, offset + strLen.value).toString('utf8'))
        finish({
          online: true,
          latencyMs: Date.now() - started,
          version: json.version?.name,
          playersOnline: json.players?.online,
          playersMax: json.players?.max,
          motd: motdText(json.description)
        })
      } catch {
        finish({ online: false, error: 'unexpected reply' })
      }
    })
    socket.connect(port, host, () => {
      socket.write(handshakePacket(host, port))
      socket.write(packet(0x00, Buffer.alloc(0)))
    })
  })
}
