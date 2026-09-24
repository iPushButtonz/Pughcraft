import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { StringDecoder } from 'node:string_decoder'
import type { ConsoleLine } from '@shared/servers'

const MAX_BUFFER_LINES = 3000
const BATCH_MS = 50
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g

const DONE = /Done \([\d.,]+s\)! For help, type/
const JOINED = /:\s([A-Za-z0-9_]{1,16}) joined the game\s*$/
const LEFT = /:\s([A-Za-z0-9_]{1,16}) left the game\s*$/

export type ProcessPhase = 'starting' | 'running' | 'stopping' | 'exited'

export interface ExitInfo {
  code: number | null
  /** True when we asked it to stop (stop/kill), false for a crash. */
  requested: boolean
  /** The last console lines, for explaining what went wrong. */
  tail: string[]
}

/** One running Minecraft server process: console, players, and safe shutdown. */
export class ServerProcess extends EventEmitter<{
  phase: [ProcessPhase]
  lines: [ConsoleLine[]]
  players: [string[]]
  exit: [ExitInfo]
}> {
  phase: ProcessPhase = 'starting'
  readonly players = new Set<string>()
  private child: ChildProcessWithoutNullStreams | null = null
  private stopRequested = false
  private pending: ConsoleLine[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private exited: Promise<void>
  private markExited!: () => void

  constructor(
    private readonly buffer: ConsoleLine[],
    private readonly nextSeq: () => number
  ) {
    super()
    this.exited = new Promise((r) => (this.markExited = r))
  }

  start(javaPath: string, args: string[], cwd: string): void {
    this.appLine(`Starting: java ${args.join(' ')}`)
    const child = spawn(javaPath, args, { cwd, windowsHide: true })
    this.child = child
    const out = new StringDecoder('utf8')
    const err = new StringDecoder('utf8')
    let outRest = ''
    let errRest = ''
    const split = (rest: string, chunk: string, source: 'out' | 'err'): string => {
      const parts = (rest + chunk).split(/\r?\n/)
      const last = parts.pop() ?? ''
      for (const p of parts) this.onLine(p.replace(ANSI, ''), source)
      return last
    }
    child.stdout.on('data', (b: Buffer) => (outRest = split(outRest, out.write(b), 'out')))
    child.stderr.on('data', (b: Buffer) => (errRest = split(errRest, err.write(b), 'err')))
    child.on('error', (e) => this.appLine(`Could not start Java: ${e.message}`))
    child.on('close', (code) => {
      if (outRest) this.onLine(outRest, 'out')
      if (errRest) this.onLine(errRest, 'err')
      this.appLine(this.stopRequested ? 'Server stopped.' : `Server process ended (exit code ${code}).`)
      this.flush()
      this.setPhase('exited')
      this.players.clear()
      this.emit('players', [])
      this.emit('exit', {
        code,
        requested: this.stopRequested,
        tail: this.buffer.slice(-60).map((l) => l.text)
      })
      this.markExited()
    })
  }

  /** Sends a console command, e.g. `say hi` or `whitelist add Alex`. */
  command(text: string): boolean {
    if (!this.child || this.phase === 'exited') return false
    const clean = text.replace(/[\r\n]+/g, ' ').trim().replace(/^\//, '')
    if (!clean) return false
    this.appLine(`> ${clean}`)
    this.child.stdin.write(`${clean}\n`)
    return true
  }

  /** Asks the server to save and stop; kills it if it hasn't exited within `timeoutMs`. */
  async stop(timeoutMs = 60_000): Promise<void> {
    if (!this.child || this.phase === 'exited') return
    this.stopRequested = true
    this.setPhase('stopping')
    this.child.stdin.write('stop\n')
    const timer = setTimeout(() => {
      this.appLine('The server did not stop in time, so it was closed forcefully.')
      this.child?.kill()
    }, timeoutMs)
    await this.exited
    clearTimeout(timer)
  }

  /** Immediate stop without saving. For stuck servers only. */
  async kill(): Promise<void> {
    if (!this.child || this.phase === 'exited') return
    this.stopRequested = true
    this.child.kill()
    await this.exited
  }

  private onLine(text: string, source: 'out' | 'err'): void {
    this.push({ seq: this.nextSeq(), text, source })
    if (this.phase === 'starting' && DONE.test(text)) this.setPhase('running')
    const joined = JOINED.exec(text)
    if (joined) {
      this.players.add(joined[1])
      this.emit('players', [...this.players])
    }
    const left = LEFT.exec(text)
    if (left && this.players.delete(left[1])) this.emit('players', [...this.players])
  }

  private appLine(text: string): void {
    this.push({ seq: this.nextSeq(), text, source: 'app' })
  }

  private push(line: ConsoleLine): void {
    this.buffer.push(line)
    if (this.buffer.length > MAX_BUFFER_LINES) this.buffer.splice(0, this.buffer.length - MAX_BUFFER_LINES)
    this.pending.push(line)
    this.flushTimer ??= setTimeout(() => this.flush(), BATCH_MS)
  }

  private flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = null
    if (this.pending.length === 0) return
    const batch = this.pending
    this.pending = []
    this.emit('lines', batch)
  }

  private setPhase(phase: ProcessPhase): void {
    if (this.phase === phase) return
    this.phase = phase
    this.emit('phase', phase)
  }
}
