export type MemoryTier = 'tooLow' | 'belowAverage' | 'okay' | 'best' | 'large' | 'excess'

/** Where the "best for most servers" range starts and ends, in MB. */
export const BEST_MIN_MB = 8192
export const BEST_MAX_MB = 10240

/** Plain-language rating for a memory choice. */
export function memoryTier(mb: number): MemoryTier {
  if (mb < 3072) return 'tooLow'
  if (mb < 6144) return 'belowAverage'
  if (mb < BEST_MIN_MB) return 'okay'
  if (mb <= BEST_MAX_MB) return 'best'
  if (mb <= 16384) return 'large'
  return 'excess'
}
