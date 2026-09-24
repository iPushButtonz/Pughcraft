import { describe, expect, it } from 'vitest'
import { PropertiesFile } from './properties'

const SAMPLE = `#Minecraft server properties
#Mon Sep 23 19:00:00 EDT 2026
enable-jmx-monitoring=false
motd=A Minecraft Server
level-seed=
server-port=25565
max-players=20
`

describe('PropertiesFile', () => {
  it('reads values', () => {
    const p = PropertiesFile.parse(SAMPLE)
    expect(p.get('motd')).toBe('A Minecraft Server')
    expect(p.get('level-seed')).toBe('')
    expect(p.get('missing')).toBeUndefined()
  })

  it('round-trips untouched files exactly', () => {
    expect(PropertiesFile.parse(SAMPLE).serialize()).toBe(SAMPLE)
  })

  it('updates in place and appends new keys at the end', () => {
    const p = PropertiesFile.parse(SAMPLE)
    p.set('max-players', '8')
    p.set('white-list', 'true')
    const lines = p.serialize().trimEnd().split('\n')
    expect(lines).toContain('max-players=8')
    expect(lines.at(-1)).toBe('white-list=true')
    expect(lines[0]).toBe('#Minecraft server properties')
  })

  it('escapes non-ASCII so any server can read it', () => {
    const p = PropertiesFile.empty()
    p.set('motd', 'Café ☕ server')
    expect(p.serialize()).toBe('motd=Caf\\u00e9 \\u2615 server\n')
    expect(PropertiesFile.parse(p.serialize()).get('motd')).toBe('Café ☕ server')
  })

  it('reads the escapes Minecraft itself writes', () => {
    const p = PropertiesFile.parse('motd=\\u00a7aGreen \\= text\\:x\ngenerator-settings={}\n')
    expect(p.get('motd')).toBe('§aGreen = text:x')
    expect(p.get('generator-settings')).toBe('{}')
  })

  it('handles Windows line endings and odd spacing', () => {
    const p = PropertiesFile.parse('a = 1\r\nb:2\r\n  c 3\r\n')
    expect(p.toObject()).toEqual({ a: '1', b: '2', c: '3' })
  })
})
