import { EventEmitter } from 'node:events'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { sanitizeSettingsPatch, settingsFromDisk, type Settings } from '@shared/settings'
import { logger } from './log'

const log = logger('settings')

/** Loads, validates and saves settings.json. Emits `change` after every saved update. */
export class SettingsStore extends EventEmitter<{ change: [next: Settings, prev: Settings] }> {
  private current: Settings
  private saving: Promise<void> = Promise.resolve()

  private constructor(
    private readonly file: string,
    initial: Settings
  ) {
    super()
    this.current = initial
  }

  static async load(file: string): Promise<SettingsStore> {
    let raw: unknown = {}
    try {
      raw = JSON.parse(await readFile(file, 'utf8'))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Keep the unreadable file for inspection instead of silently losing it.
        log.warn('settings.json unreadable, using defaults (copy kept as settings.json.bad)', err)
        await copyFile(file, `${file}.bad`).catch(() => undefined)
      }
    }
    return new SettingsStore(file, settingsFromDisk(raw))
  }

  get(): Settings {
    return this.current
  }

  /** Applies the valid parts of `patch`, saves, and returns the new settings. */
  async update(patch: unknown): Promise<Settings> {
    const clean = sanitizeSettingsPatch(patch)
    if (Object.keys(clean).length === 0) return this.current
    const prev = this.current
    this.current = { ...prev, ...clean }
    await this.persist()
    this.emit('change', this.current, prev)
    return this.current
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.current, null, 2)
    const write = async (): Promise<void> => {
      await mkdir(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      await writeFile(tmp, snapshot, 'utf8')
      await rename(tmp, this.file)
    }
    // Chain writes so two quick updates never interleave; a failed write doesn't block later ones.
    this.saving = this.saving.then(write, write)
    return this.saving.catch((err) => log.error('could not save settings', err))
  }
}
