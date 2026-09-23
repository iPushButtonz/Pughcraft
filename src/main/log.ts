import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAX_BYTES = 5 * 1024 * 1024
const KEEP_FILES = 3
const CHECK_EVERY = 200

let file: string | null = null
let writesSinceCheck = 0
const mirrorToConsole = !process.env.PUGHCRAFT_QUIET

/** Starts writing the app log to `<dir>/pughcraft.log`, rotating at 5 MB. */
export function initLog(dir: string): void {
  mkdirSync(dir, { recursive: true })
  file = join(dir, 'pughcraft.log')
  rotateIfNeeded()
}

function rotateIfNeeded(): void {
  if (!file || !existsSync(file) || statSync(file).size < MAX_BYTES) return
  const oldest = `${file}.${KEEP_FILES}`
  if (existsSync(oldest)) rmSync(oldest)
  for (let i = KEEP_FILES - 1; i >= 1; i--) {
    if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`)
  }
  renameSync(file, `${file}.1`)
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`
  return String(err)
}

function write(level: string, scope: string, message: string, err?: unknown): void {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} [${scope}] ${message}${
    err === undefined ? '' : ` | ${describe(err)}`
  }\n`
  if (mirrorToConsole) process.stdout.write(line)
  if (!file) return
  try {
    if (++writesSinceCheck >= CHECK_EVERY) {
      writesSinceCheck = 0
      rotateIfNeeded()
    }
    appendFileSync(file, line)
  } catch {
    // Logging must never crash the app.
  }
}

export interface Logger {
  info(message: string): void
  warn(message: string, err?: unknown): void
  error(message: string, err?: unknown): void
}

export function logger(scope: string): Logger {
  return {
    info: (m) => write('INFO', scope, m),
    warn: (m, e) => write('WARN', scope, m, e),
    error: (m, e) => write('ERROR', scope, m, e)
  }
}
