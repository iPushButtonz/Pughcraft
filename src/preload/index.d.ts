import type { PughcraftApi } from '../shared/ipc'

declare global {
  interface Window {
    pughcraft: PughcraftApi
  }
}

export {}
