export type UiMode = 'simple' | 'advanced'
export type CloseBehavior = 'keep-running' | 'stop-and-quit'
export type ThemeSetting = 'system' | 'light' | 'dark'

export interface Settings {
  schema: 1
  mode: UiMode
  closeBehavior: CloseBehavior
  startAtLogin: boolean
  theme: ThemeSetting
  /** Set once the "still running in the tray" hint has been shown. */
  trayHintShown: boolean
  /** When the user ticked "I agree to the Minecraft EULA" (ISO date), or null. */
  eulaAcceptedAt: string | null
  /** Keep the PC awake while any server is running. */
  preventSleep: boolean
  /**
   * Whether the Connection Doctor may ask outside services (public-IP lookup, mcstatus.io)
   * to test the server from the internet. 'ask' until the user decides.
   */
  outsideChecks: 'ask' | 'on-demand' | 'never'
}

export type SettingsPatch = Partial<Omit<Settings, 'schema'>>

export const DEFAULT_SETTINGS: Settings = {
  schema: 1,
  mode: 'simple',
  closeBehavior: 'keep-running',
  startAtLogin: false,
  theme: 'system',
  trayHintShown: false,
  eulaAcceptedAt: null,
  preventSleep: true,
  outsideChecks: 'ask'
}

const oneOf =
  <T extends string>(...values: T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (values as string[]).includes(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

const validators: { [K in keyof SettingsPatch]-?: (v: unknown) => boolean } = {
  mode: oneOf('simple', 'advanced'),
  closeBehavior: oneOf('keep-running', 'stop-and-quit'),
  startAtLogin: isBool,
  theme: oneOf('system', 'light', 'dark'),
  trayHintShown: isBool,
  eulaAcceptedAt: (v) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v))),
  preventSleep: isBool,
  outsideChecks: oneOf('ask', 'on-demand', 'never')
}

/** Keeps only known keys with valid values; anything else is dropped. */
export function sanitizeSettingsPatch(input: unknown): SettingsPatch {
  if (typeof input !== 'object' || input === null) return {}
  const out: Record<string, unknown> = {}
  for (const [key, check] of Object.entries(validators)) {
    const value = (input as Record<string, unknown>)[key]
    if (value !== undefined && check(value)) out[key] = value
  }
  return out as SettingsPatch
}

/** Builds full settings from whatever was on disk, falling back to defaults per key. */
export function settingsFromDisk(raw: unknown): Settings {
  return { ...DEFAULT_SETTINGS, ...sanitizeSettingsPatch(raw), schema: 1 }
}
