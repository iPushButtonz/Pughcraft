import { describe, expect, it } from 'vitest'
import { deniedJoinName, offlineUuid } from './players'

describe('whitelist join requests', () => {
  it('reads the name from every known log format', () => {
    expect(deniedJoinName('[12:00:00] [Server thread/INFO]: Disconnecting Alex (/127.0.0.1:54321): You are not white-listed on this server!')).toBe('Alex')
    expect(
      deniedJoinName(
        '[12:00:00] [Server thread/INFO]: Disconnecting com.mojang.authlib.GameProfile@1a2b3c[id=069a79f4-44e9-4726-a5be-fca90e38aaf5,name=Notch,properties={},legacy=false] (/10.0.0.5:5000): You are not white-listed on this server!'
      )
    ).toBe('Notch')
    expect(
      deniedJoinName(
        '[12:00:00] [Server thread/INFO]: Disconnecting GameProfile[id=069a79f4-44e9-4726-a5be-fca90e38aaf5, name=Steve_2, properties=...] (/10.0.0.5:5000): You are not white-listed on this server!'
      )
    ).toBe('Steve_2')
    expect(
      deniedJoinName(
        '[12:00:00] [Server thread/INFO]: com.mojang.authlib.GameProfile@1a2b[id=<null>,name=Alex,properties={},legacy=false] (/1.2.3.4:5678) lost connection: You are not white-listed on this server!'
      )
    ).toBe('Alex')
    expect(deniedJoinName('[12:00:00 INFO]: Alex (/1.2.3.4:5678) lost connection: You are not whitelisted on this server!')).toBe('Alex')
  })

  it('ignores chat and other lines', () => {
    expect(deniedJoinName('[12:00:00] [Server thread/INFO]: <Bob> Disconnecting Alex (/1.2.3.4:5): You are not white-listed on this server!')).toBeNull()
    expect(deniedJoinName('[12:00:00] [Server thread/INFO]: [Not Secure] <Bob> Alex (x) not whitelisted')).toBeNull()
    expect(deniedJoinName('[12:00:00] [Server thread/INFO]: [Server] Disconnecting Alex (/1.2.3.4:5): not white-listed')).toBeNull()
    expect(deniedJoinName('[12:00:00] [Server thread/INFO]: Alex joined the game')).toBeNull()
  })
})

describe('offline-mode UUIDs', () => {
  it('matches what Minecraft gives offline players', () => {
    expect(offlineUuid('Notch')).toBe('b50ad385-829d-3141-a216-7e7d7539ba7f')
  })
})
