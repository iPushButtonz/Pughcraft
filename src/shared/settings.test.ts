import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, sanitizeSettingsPatch, settingsFromDisk } from './settings'

describe('sanitizeSettingsPatch', () => {
  it('keeps valid known keys', () => {
    expect(sanitizeSettingsPatch({ mode: 'advanced', startAtLogin: true })).toEqual({
      mode: 'advanced',
      startAtLogin: true
    })
  })

  it('drops unknown keys and invalid values', () => {
    expect(
      sanitizeSettingsPatch({ mode: 'expert', startAtLogin: 'yes', evil: 1, schema: 99 })
    ).toEqual({})
  })

  it('handles non-objects', () => {
    expect(sanitizeSettingsPatch(null)).toEqual({})
    expect(sanitizeSettingsPatch('mode=advanced')).toEqual({})
  })
})

describe('settingsFromDisk', () => {
  it('fills missing keys with defaults', () => {
    expect(settingsFromDisk({ theme: 'dark' })).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' })
  })

  it('recovers from garbage', () => {
    expect(settingsFromDisk([1, 2, 3])).toEqual(DEFAULT_SETTINGS)
  })
})
