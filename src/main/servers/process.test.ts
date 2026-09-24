import { describe, expect, it } from 'vitest'
import { JOINED, LEFT } from './process'

describe('player tracking', () => {
  it('reads joins and leaves from every loader’s log format', () => {
    expect(JOINED.exec('[12:00:00] [Server thread/INFO]: Steve joined the game')?.[1]).toBe('Steve')
    expect(JOINED.exec('[12:00:00 INFO]: Alex_2 joined the game')?.[1]).toBe('Alex_2')
    expect(JOINED.exec('[12:00:00] [Server thread/INFO] [minecraft/MinecraftServer]: Steve joined the game')?.[1]).toBe('Steve')
    expect(LEFT.exec('[12:00:00] [Server thread/INFO]: Steve left the game')?.[1]).toBe('Steve')
  })

  it('is not fooled by chat or /say', () => {
    expect(JOINED.exec('[12:00:00] [Server thread/INFO]: <Alex> : Steve joined the game')).toBeNull()
    expect(JOINED.exec('[12:00:00] [Server thread/INFO]: [Not Secure] <Alex> Steve joined the game')).toBeNull()
    expect(JOINED.exec('[12:00:00] [Server thread/INFO]: [Server] : Steve joined the game')).toBeNull()
    expect(LEFT.exec('[12:00:00] [Server thread/INFO]: <Alex> : Steve left the game')).toBeNull()
  })
})
