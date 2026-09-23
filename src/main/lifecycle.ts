import { app } from 'electron'
import { logger } from './log'

const log = logger('lifecycle')

interface ShutdownHook {
  name: string
  run: () => Promise<void>
  timeoutMs: number
}

/**
 * Owns quitting. Every real exit goes through `quit()` so shutdown hooks
 * (e.g. saving and stopping servers) always run first.
 */
export class Lifecycle {
  private readonly hooks: ShutdownHook[] = []
  private quitPromise: Promise<void> | null = null

  get isQuitting(): boolean {
    return this.quitPromise !== null
  }

  onShutdown(name: string, run: () => Promise<void>, timeoutMs = 60_000): void {
    this.hooks.push({ name, run, timeoutMs })
  }

  quit(): Promise<void> {
    this.quitPromise ??= (async () => {
      log.info('quitting')
      await this.runHooks()
      app.exit(0)
    })()
    return this.quitPromise
  }

  private async runHooks(): Promise<void> {
    await Promise.allSettled(
      this.hooks.map(async (hook) => {
        let timer: NodeJS.Timeout | undefined
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timed out')), hook.timeoutMs)
        })
        try {
          await Promise.race([hook.run(), timeout])
        } catch (err) {
          log.warn(`shutdown hook "${hook.name}" did not finish cleanly`, err)
        } finally {
          clearTimeout(timer)
        }
      })
    )
  }
}
