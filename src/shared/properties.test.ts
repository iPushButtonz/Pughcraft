import { describe, expect, it } from 'vitest'
import { PROPERTY_DEFS, describeProperty } from './properties'
import { GAME_RULES, GAME_RULES_BY_ID, describeGameRule } from './gamerules'

const byKey = Object.fromEntries(PROPERTY_DEFS.map((d) => [d.key, d]))

describe('property schema', () => {
  it('has unique keys and sane ranges', () => {
    const keys = PROPERTY_DEFS.map((d) => d.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const d of PROPERTY_DEFS) {
      if (d.type === 'int') {
        expect(d.min).toBeLessThanOrEqual(d.default)
        expect(d.max).toBeGreaterThanOrEqual(d.default)
      }
      if (d.type === 'enum') expect(d.options.some((o) => o.value === d.default)).toBe(true)
    }
  })

  it('describes every setting at its default', () => {
    for (const d of PROPERTY_DEFS) {
      const text = describeProperty(d, String(d.default))
      expect(text, d.key).not.toBe('')
      expect(text, d.key).not.toContain('{v}')
    }
  })

  it('describes the current value', () => {
    expect(describeProperty(byKey['white-list'], 'true')).toBe('Only whitelisted players can join')
    expect(describeProperty(byKey['white-list'], 'false')).toBe('Anyone can join')
    expect(describeProperty(byKey['player-idle-timeout'], '0')).toBe('Idle players are never kicked')
    expect(describeProperty(byKey['player-idle-timeout'], '15')).toBe('Idle players are kicked after 15 minutes')
    expect(describeProperty(byKey['level-seed'], '')).toBe('Random seed')
  })
})

describe('game rule descriptions', () => {
  it('describes every rule both ways', () => {
    for (const r of GAME_RULES) {
      if (r.type === 'bool') {
        expect(r.on, r.id).not.toBe('')
        expect(r.off, r.id).not.toBe(r.on)
      } else {
        expect(describeGameRule(r, r.default), r.id).not.toContain('{v}')
      }
    }
  })

  it('follows the value', () => {
    const phantoms = GAME_RULES_BY_ID['spawn_phantoms']
    expect(describeGameRule(phantoms, true)).toBe('Phantoms spawn')
    expect(describeGameRule(phantoms, false)).toBe('Phantoms don’t spawn')
    expect(describeGameRule(GAME_RULES_BY_ID['random_tick_speed'], 10)).toContain('speed 10')
  })
})
