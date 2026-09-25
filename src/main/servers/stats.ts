import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import type { ServerStats } from '@shared/players'
import { logger } from '../log'
import type { ServerManager } from './manager'

const log = logger('stats')
const INTERVAL_MS = 2000

interface Sample {
  cpuMs: number
  memoryBytes: number
}

/**
 * Reads each running server's CPU and memory every 2 s, without extra dependencies:
 * Linux reads /proc; Windows keeps one hidden PowerShell that answers "Get-Process" for us.
 */
export class StatsSampler extends EventEmitter<{ stats: [ServerStats[]] }> {
  private timer: NodeJS.Timeout | null = null
  private last = new Map<number, { at: number; cpuMs: number }>()
  private ps: ChildProcessWithoutNullStreams | null = null
  private psBuffer = ''
  private psWaiter: ((lines: string[]) => void) | null = null
  private busy = false
  private readonly cores = Math.max(1, cpus().length)

  constructor(private readonly servers: ServerManager) {
    super()
    servers.on('activity', (count) => (count > 0 ? this.start() : this.stop()))
  }

  private start(): void {
    this.timer ??= setInterval(() => void this.tick(), INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.last.clear()
    this.ps?.kill()
    this.ps = null
  }

  private async tick(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      const running = this.servers
        .list()
        .map((s) => ({ id: s.config.id, pid: this.servers.pid(s.config.id) }))
        .filter((x): x is { id: string; pid: number } => x.pid !== null)
      if (!running.length) return
      const samples = await this.sample(running.map((r) => r.pid))
      const now = Date.now()
      const out: ServerStats[] = []
      for (const { id, pid } of running) {
        const s = samples.get(pid)
        if (!s) continue
        const prev = this.last.get(pid)
        this.last.set(pid, { at: now, cpuMs: s.cpuMs })
        if (!prev) continue
        const wall = now - prev.at
        const cpuPercent = wall > 0 ? Math.min(100, Math.max(0, ((s.cpuMs - prev.cpuMs) / wall / this.cores) * 100)) : 0
        out.push({ serverId: id, cpuPercent: Math.round(cpuPercent * 10) / 10, memoryBytes: s.memoryBytes })
      }
      if (out.length) this.emit('stats', out)
    } catch (err) {
      log.warn('could not read server stats', err)
    } finally {
      this.busy = false
    }
  }

  private sample(pids: number[]): Promise<Map<number, Sample>> {
    return process.platform === 'win32' ? this.sampleWindows(pids) : this.sampleLinux(pids)
  }

  private async sampleLinux(pids: number[]): Promise<Map<number, Sample>> {
    const out = new Map<number, Sample>()
    const ticksPerSec = 100 // USER_HZ on practically every Linux
    const pageSize = 4096
    for (const pid of pids) {
      try {
        const stat = await readFile(`/proc/${pid}/stat`, 'utf8')
        // Fields after the ")" of the command name; utime and stime are fields 14 and 15.
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
        const cpuMs = ((Number(fields[11]) + Number(fields[12])) / ticksPerSec) * 1000
        const statm = (await readFile(`/proc/${pid}/statm`, 'utf8')).split(' ')
        out.set(pid, { cpuMs, memoryBytes: Number(statm[1]) * pageSize })
      } catch {
        // The process ended between listing and reading.
      }
    }
    return out
  }

  private ensurePowerShell(): ChildProcessWithoutNullStreams {
    if (this.ps && this.ps.exitCode === null) return this.ps
    const script = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      'while ($true) {',
      '  $line = [Console]::In.ReadLine()',
      '  if ($line -eq $null) { break }',
      "  $ids = $line.Split(',') | ForEach-Object { [int]$_ }",
      '  foreach ($p in (Get-Process -Id $ids)) {',
      '    [Console]::Out.WriteLine(("{0} {1} {2}" -f $p.Id, [long]$p.TotalProcessorTime.TotalMilliseconds, $p.WorkingSet64))',
      '  }',
      "  [Console]::Out.WriteLine('END')",
      '  [Console]::Out.Flush()',
      '}'
    ].join('\n')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const ps = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true
    })
    ps.stdout.setEncoding('utf8')
    ps.stdout.on('data', (chunk: string) => {
      this.psBuffer += chunk
      const end = this.psBuffer.indexOf('END')
      if (end === -1) return
      const lines = this.psBuffer.slice(0, end).split(/\r?\n/).filter(Boolean)
      this.psBuffer = this.psBuffer.slice(end + 3).replace(/^\r?\n/, '')
      this.psWaiter?.(lines)
      this.psWaiter = null
    })
    ps.on('exit', () => {
      if (this.ps === ps) this.ps = null
      this.psWaiter?.([])
      this.psWaiter = null
    })
    ps.on('error', (err) => log.warn('stats helper failed', err))
    this.ps = ps
    return ps
  }

  private sampleWindows(pids: number[]): Promise<Map<number, Sample>> {
    return new Promise((resolve) => {
      const ps = this.ensurePowerShell()
      const timeout = setTimeout(() => {
        this.psWaiter = null
        resolve(new Map())
      }, 5000)
      this.psWaiter = (lines) => {
        clearTimeout(timeout)
        const out = new Map<number, Sample>()
        for (const line of lines) {
          const [pid, cpu, mem] = line.trim().split(' ').map(Number)
          if (Number.isFinite(pid)) out.set(pid, { cpuMs: cpu, memoryBytes: mem })
        }
        resolve(out)
      }
      ps.stdin.write(`${pids.join(',')}\n`)
    })
  }
}
