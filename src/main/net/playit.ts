import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app, shell } from 'electron'
import { APP_NAME } from '@shared/brand'
import type { PlayitStatus } from '@shared/network'
import type { TaskContext } from '../tasks'
import { download, userAgent } from '../core/http'
import { logger } from '../log'

const log = logger('playit')

/**
 * playit.gg tunnel, built in (owner's choice): we download playit's official, signed agent
 * (pinned version + sha256), link it to the user's playit account with a one-time browser
 * approval, create a Minecraft Java tunnel per server through playit's API, and run the agent
 * invisibly while any tunnelled server is running. Third-party; clearly labelled in the UI.
 */

const API = 'https://api.playit.gg'
const AGENT_VERSION = '1.0.10'
const AGENT_BUILDS: Partial<Record<string, { file: string; sha256: string }>> = {
  'win32-x64': {
    file: 'playit-windows-x86_64-signed.exe',
    sha256: '2dbdaad119844cbbc062cc9774b8b462afa5f1b4b7832a9fc5ef4676cae887cf'
  },
  'linux-x64': {
    file: 'playit-linux-amd64',
    sha256: '2df7d9f10227ab312b1ad341853db4e8a8243df5cfcdbae58713a4271711c339'
  },
  'linux-arm64': {
    file: 'playit-linux-aarch64',
    sha256: '4c0db3e7b3a8158e249441c2f0b73f54e83429395890c7b1ca45fd7a6303d763'
  }
}

export class PlayitError extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message)
    this.name = 'PlayitError'
  }
}

/** Plain-English versions of playit's error codes users are likely to hit. */
const ERROR_TEXT: Record<string, string> = {
  RequiresVerifiedAccount: 'playit.gg needs you to verify your account email before creating this tunnel.',
  RequiresPlayitPremium: 'This needs a paid playit.gg plan.',
  InvalidAgentKey: 'The link to your playit.gg account is no longer valid. Link it again.',
  UserRejected: 'The link was declined on playit.gg.',
  CodeExpired: 'The link request expired. Please try again.',
  AgentDisabledOverLimit: 'Your playit.gg account has reached its free limit.'
}

async function api<T>(path: string, body: unknown, secret?: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': userAgent(),
      ...(secret ? { Authorization: `Agent-Key ${secret.trim()}` } : {})
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(20_000)
  })
  const json = (await res.json().catch(() => null)) as { status: string; data: unknown } | null
  if (json?.status === 'success') return json.data as T
  const code =
    typeof json?.data === 'string'
      ? json.data
      : ((json?.data as { message?: string } | undefined)?.message ?? `HTTP ${res.status}`)
  throw new PlayitError(ERROR_TEXT[code] ?? `playit.gg answered: ${code}`, code)
}

interface AgentTunnel {
  id: string
  name: string | null
  port: { from: number; to: number }
  local_port: number
  tunnel_type: string | null
  assigned_domain: string
  custom_domain: string | null
  disabled: unknown | null
}

interface RunData {
  agent_id: string
  account_status: string
  tunnels: AgentTunnel[]
  pending: { id: string }[]
}

export class PlayitManager {
  private agent: ChildProcess | null = null
  private accountStatus: string | null = null

  constructor(
    private readonly toolsDir: string,
    private readonly stateDir: string,
    private readonly logsDir: string
  ) {}

  private get build(): { file: string; sha256: string } | undefined {
    return AGENT_BUILDS[`${process.platform}-${process.arch}`]
  }
  private get agentPath(): string {
    return join(this.toolsDir, `playit-${AGENT_VERSION}${process.platform === 'win32' ? '.exe' : ''}`)
  }
  private get secretFile(): string {
    return join(this.stateDir, 'agent-secret.txt')
  }

  async secret(): Promise<string | null> {
    try {
      return (await readFile(this.secretFile, 'utf8')).trim() || null
    } catch {
      return null
    }
  }

  async status(): Promise<PlayitStatus> {
    return {
      supported: !!this.build,
      linked: (await this.secret()) !== null,
      agentRunning: this.agent !== null,
      accountStatus: this.accountStatus
    }
  }

  /** Downloads the pinned, checksum-verified official agent if it isn't here yet. */
  async ensureAgent(ctx: TaskContext): Promise<void> {
    const build = this.build
    if (!build) throw new PlayitError('playit.gg has no agent for this kind of PC.', 'Unsupported')
    if (existsSync(this.agentPath)) return
    ctx.step('Downloading the playit.gg helper')
    await download({
      url: `https://github.com/playit-cloud/playit-agent/releases/download/v${AGENT_VERSION}/${build.file}`,
      dest: this.agentPath,
      checksum: { algorithm: 'sha256', hex: build.sha256 },
      signal: ctx.signal,
      onProgress: (done, total) => ctx.bytes(done, total)
    })
    if (process.platform !== 'win32') await chmod(this.agentPath, 0o755)
  }

  /**
   * Links this PC to the user's playit.gg account: opens playit.gg once in the browser,
   * waits for the user to approve (guest accounts work), then stores the agent key locally.
   */
  async link(ctx: TaskContext): Promise<void> {
    await this.ensureAgent(ctx)
    const code = randomBytes(5).toString('hex')
    // playit rejects long version labels ("VersionTextTooLong"); keep it short.
    const version = `${APP_NAME} ${app.getVersion()}`.slice(0, 20)
    ctx.step('Waiting for you to approve in your browser…')
    ctx.progress(null, 'A playit.gg page opened. Click “Accept” there (a guest account is fine).')
    let opened = false
    const deadline = Date.now() + 15 * 60 * 1000
    for (;;) {
      ctx.throwIfCancelled()
      if (Date.now() > deadline) throw new PlayitError(ERROR_TEXT.CodeExpired, 'CodeExpired')
      const state = await api<string>('/claim/setup', { code, agent_type: 'self-managed', version })
      if (state === 'UserAccepted') break
      if (state === 'UserRejected') throw new PlayitError(ERROR_TEXT.UserRejected, 'UserRejected')
      if (!opened) {
        await shell.openExternal(`https://playit.gg/claim/${code}`)
        opened = true
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    ctx.step('Finishing the link')
    const { secret_key } = await api<{ secret_key: string }>('/claim/exchange', { code })
    await mkdir(this.stateDir, { recursive: true })
    await writeFile(this.secretFile, secret_key, { encoding: 'utf8', mode: 0o600 })
    const run = await api<RunData>('/agents/rundata', {}, secret_key)
    this.accountStatus = run.account_status
    log.info(`linked to playit.gg (account ${run.account_status})`)
  }

  async unlink(): Promise<void> {
    this.stopAgent()
    await rm(this.secretFile, { force: true })
    this.accountStatus = null
  }

  private async runData(): Promise<RunData> {
    const secret = await this.secret()
    if (!secret) throw new PlayitError('This PC is not linked to playit.gg yet.', 'NotLinked')
    const run = await api<RunData>('/agents/rundata', {}, secret)
    this.accountStatus = run.account_status
    return run
  }

  /** Returns the public address for `port`, creating the tunnel the first time. */
  async ensureTunnel(opts: {
    tunnelId: string | null
    name: string
    port: number
    signal?: AbortSignal
  }): Promise<{ tunnelId: string; address: string }> {
    const secret = await this.secret()
    if (!secret) throw new PlayitError('This PC is not linked to playit.gg yet.', 'NotLinked')
    let run = await this.runData()
    let tunnel = run.tunnels.find((t) => t.id === opts.tunnelId)
    if (tunnel && tunnel.local_port !== opts.port) {
      await api('/tunnels/update', {
        tunnel_id: tunnel.id,
        local_ip: '127.0.0.1',
        local_port: opts.port,
        agent_id: run.agent_id,
        enabled: true
      }, secret)
    }
    let tunnelId = tunnel?.id ?? null
    if (!tunnel && !run.pending.some((p) => p.id === opts.tunnelId)) {
      const created = await api<{ id: string }>(
        '/tunnels/create',
        {
          name: opts.name.replace(/[^\x20-\x7e]/g, '').slice(0, 40) || 'Minecraft',
          tunnel_type: 'minecraft-java',
          port_type: 'tcp',
          port_count: 1,
          origin: { type: 'agent', data: { agent_id: run.agent_id, local_ip: '127.0.0.1', local_port: opts.port } },
          enabled: true,
          alloc: null,
          firewall_id: null,
          proxy_protocol: null
        },
        secret
      )
      tunnelId = created.id
    }
    tunnelId ??= opts.tunnelId
    // New tunnels take a few seconds to get an address.
    for (let i = 0; i < 30; i++) {
      tunnel = run.tunnels.find((t) => t.id === tunnelId)
      if (tunnel?.assigned_domain) break
      if (opts.signal?.aborted) throw new Error('Cancelled')
      await new Promise((r) => setTimeout(r, 2000))
      run = await this.runData()
    }
    if (!tunnel?.assigned_domain || !tunnelId) {
      throw new PlayitError('playit.gg did not give the tunnel an address in time. Try again.', 'Timeout')
    }
    const host = tunnel.custom_domain || tunnel.assigned_domain
    // Minecraft tunnels come with a DNS record that points at the right port.
    const address = tunnel.tunnel_type === 'minecraft-java' ? host : `${host}:${tunnel.port.from}`
    return { tunnelId, address }
  }

  /** Starts the agent in the background (no window). Safe to call repeatedly. */
  async startAgent(): Promise<void> {
    if (this.agent) return
    const secret = await this.secret()
    if (!secret || !existsSync(this.agentPath)) {
      throw new PlayitError('The playit.gg helper is not set up yet.', 'NotLinked')
    }
    await mkdir(this.logsDir, { recursive: true })
    const pipe =
      process.platform === 'win32'
        ? `\\\\.\\pipe\\pughcraft-playit-${process.pid}`
        : join(this.stateDir, 'playit.sock')
    const child = spawn(
      this.agentPath,
      ['--secret-path', this.secretFile, '--socket-path', pipe, '--log-path', join(this.logsDir, 'playit.log')],
      { windowsHide: true, stdio: 'ignore' }
    )
    this.agent = child
    child.on('exit', (code) => {
      log.info(`playit agent exited (${code})`)
      if (this.agent === child) this.agent = null
    })
    child.on('error', (err) => log.error('could not start the playit agent', err))
    log.info('playit agent started')
  }

  stopAgent(): void {
    this.agent?.kill()
    this.agent = null
  }
}
