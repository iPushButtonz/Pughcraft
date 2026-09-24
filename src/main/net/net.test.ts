import { describe, expect, it } from 'vitest'
import { createServer } from 'node:net'
import { classifyIpv4, joinAddress } from './ipclass'
import { handshakePacket, pingServer, readVarInt, writeVarInt } from './ping'

describe('classifyIpv4', () => {
  it.each([
    ['192.168.50.154', 'private'],
    ['10.0.0.5', 'private'],
    ['172.20.1.1', 'private'],
    ['172.32.1.1', 'public'],
    ['100.64.0.1', 'cgnat'],
    ['100.127.255.254', 'cgnat'],
    ['100.128.0.1', 'public'],
    ['169.254.3.4', 'link-local'],
    ['127.0.0.1', 'loopback'],
    ['8.8.8.8', 'public'],
    ['300.1.1.1', 'invalid'],
    ['nope', 'invalid']
  ])('%s is %s', (ip, kind) => expect(classifyIpv4(ip)).toBe(kind))

  it('omits the default port', () => {
    expect(joinAddress('1.2.3.4', 25565)).toBe('1.2.3.4')
    expect(joinAddress('1.2.3.4', 25570)).toBe('1.2.3.4:25570')
  })
})

describe('VarInt', () => {
  it.each([0, 1, 127, 128, 255, 25565, 2097151, 2147483647, -1])('round-trips %i', (n) => {
    const buf = writeVarInt(n)
    expect(readVarInt(buf)).toEqual({ value: n | 0, size: buf.length })
  })

  it('encodes -1 as five bytes like Minecraft', () => {
    expect([...writeVarInt(-1)]).toEqual([0xff, 0xff, 0xff, 0xff, 0x0f])
  })

  it('builds a handshake with a length prefix', () => {
    const p = handshakePacket('localhost', 25565)
    expect(readVarInt(p)!.value).toBe(p.length - 1)
  })
})

describe('pingServer', () => {
  it('reads a status reply from a fake server', async () => {
    const reply = JSON.stringify({
      version: { name: '26.3', protocol: 800 },
      players: { online: 2, max: 20 },
      description: { text: 'Hello', extra: [{ text: ' world' }] }
    })
    const server = createServer((sock) => {
      sock.once('data', () => {
        const str = Buffer.from(reply)
        const body = Buffer.concat([writeVarInt(0), writeVarInt(str.length), str])
        sock.write(Buffer.concat([writeVarInt(body.length), body]))
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const port = (server.address() as { port: number }).port
    const result = await pingServer('127.0.0.1', port)
    server.close()
    expect(result).toMatchObject({ online: true, version: '26.3', playersOnline: 2, playersMax: 20, motd: 'Hello world' })
  })

  it('reports a closed port as offline', async () => {
    const result = await pingServer('127.0.0.1', 1, 1000)
    expect(result.online).toBe(false)
  })
})
