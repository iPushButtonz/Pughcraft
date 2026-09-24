import type { LoaderAvailability } from '@shared/servers'
import { LOADERS, type ManagedLoader } from '../core/loaders'
import type { MojangMeta } from '../core/mojang'
import { logger } from '../log'

const log = logger('catalog')

/** Which server types work with a Minecraft version, and their versions. */
export async function loaderAvailability(
  mojang: MojangMeta,
  mc: string
): Promise<LoaderAvailability[]> {
  const entries = Object.entries(LOADERS) as [ManagedLoader, (typeof LOADERS)[ManagedLoader]][]
  return Promise.all(
    entries.map(async ([loader, mod]): Promise<LoaderAvailability> => {
      try {
        const versions = await mod.versions(mc, mojang)
        return {
          loader,
          available: versions.length > 0,
          versions,
          reason: versions.length > 0 ? null : `Not available for Minecraft ${mc}.`
        }
      } catch (err) {
        log.warn(`could not list ${loader} versions for ${mc}`, err)
        return {
          loader,
          available: false,
          versions: [],
          reason: "Couldn't reach its download site. Check your internet connection."
        }
      }
    })
  )
}
