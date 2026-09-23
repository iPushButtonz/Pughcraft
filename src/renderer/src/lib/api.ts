import type { PughcraftApi } from '@shared/ipc'

/** Everything the UI can ask the app to do. Implemented in the preload script. */
export const api: PughcraftApi = window.pughcraft
