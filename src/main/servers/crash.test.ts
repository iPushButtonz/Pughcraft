import { describe, expect, it } from 'vitest'
import { explainCrash } from './crash'
import { isClientClassCrash, suspectIds } from '../import/culprit'

describe('explainCrash', () => {
  it('names a missing Fabric dependency', () => {
    const tail = [
      'Incompatible mods found!',
      " - Mod 'Sodium Extra' (sodium-extra) 0.5.7 requires any version of sodium, which is missing!"
    ]
    expect(explainCrash(tail, 25565)).toBe("The mod Sodium Extra needs sodium, which isn't installed. Add it to the server's mods folder.")
  })

  it('names a missing Forge dependency', () => {
    const tail = ["Missing or unsupported mandatory dependencies:", "\tMod ID: 'geckolib', Requested by: 'alexsmobs', Expected range: '[4.4,)'"]
    expect(explainCrash(tail, 25565)).toMatch(/alexsmobs needs geckolib/)
  })

  it('explains a port clash', () => {
    expect(explainCrash(['**** FAILED TO BIND TO PORT!'], 25570)).toMatch(/port 25570/)
  })

  it('falls back to the console hint', () => {
    expect(explainCrash(['something odd'], 25565)).toMatch(/Console tab/)
  })
})

describe('client-only culprit detection', () => {
  const forge = [
    '[modloading-worker-0/ERROR] Failed to create mod instance. ModID: fancymenu, class de.keksuccino.fancymenu.FancyMenu',
    'java.lang.RuntimeException: Attempted to load class net/minecraft/client/gui/screens/Screen for invalid dist DEDICATED_SERVER'
  ]

  it('recognises a game-only class crash', () => {
    expect(isClientClassCrash(forge)).toBe(true)
    expect(isClientClassCrash(['Done (3.2s)!'])).toBe(false)
  })

  it('pulls out the mod id', () => {
    expect(suspectIds(forge)).toContain('fancymenu')
    expect(suspectIds(["Could not execute entrypoint stage 'main' due to errors, provided by 'zoomify'"])).toContain('zoomify')
  })
})
