import { createSocket } from 'node:dgram'

/**
 * NAT-PMP (RFC 6886): the port-forward protocol Apple routers and some others speak
 * instead of UPnP. Messages go only to the router on UDP 5351.
 */

const RESULT_TEXT: Record<number, string> = {
  1: 'unsupported version',
  2: 'not authorized (port forwarding is turned off on the router)',
  3: 'network failure',
  4: 'out of resources',
  5: 'unsupported request'
}

function request(gateway: string, payload: Buffer, expectOp: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4')
    let attempt = 0
    let timer: NodeJS.Timeout
    const done = (err: Error | null, msg?: Buffer): void => {
      clearTimeout(timer)
      socket.close()
      if (err) reject(err)
      else resolve(msg!)
    }
    socket.on('error', (err) => done(err))
    socket.on('message', (msg) => {
      if (msg.length >= 8 && msg[1] === expectOp) done(null, msg)
    })
    const send = (): void => {
      if (attempt >= 4) return done(new Error('The router did not answer NAT-PMP.'))
      socket.send(payload, 5351, gateway)
      timer = setTimeout(send, 250 * 2 ** attempt++)
    }
    socket.bind(0, send)
  })
}

function check(msg: Buffer): void {
  const result = msg.readUInt16BE(2)
  if (result !== 0) throw new Error(`NAT-PMP refused: ${RESULT_TEXT[result] ?? `code ${result}`}`)
}

export async function natPmpExternalIp(gateway: string): Promise<string> {
  const msg = await request(gateway, Buffer.from([0, 0]), 128)
  check(msg)
  return [...msg.subarray(8, 12)].join('.')
}

/** Maps TCP `port` on the router to this PC. `lifetime` 0 removes the mapping. */
export async function natPmpMap(gateway: string, port: number, lifetime: number): Promise<void> {
  const payload = Buffer.alloc(12)
  payload[0] = 0
  payload[1] = 2 // TCP
  payload.writeUInt16BE(port, 4)
  payload.writeUInt16BE(lifetime === 0 ? 0 : port, 6)
  payload.writeUInt32BE(lifetime, 8)
  const msg = await request(gateway, payload, 130)
  check(msg)
  if (lifetime > 0 && msg.readUInt16BE(10) !== port) {
    // The router picked another public port; clean up rather than hand out a wrong address.
    await natPmpMap(gateway, port, 0).catch(() => undefined)
    throw new Error(`The router would only forward a different port (${msg.readUInt16BE(10)}).`)
  }
}
