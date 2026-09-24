import { EventEmitter } from 'node:events'
import type {
  Audience,
  DoctorReport,
  FirewallView,
  InternetProblem,
  ServerNetworkView
} from '@shared/network'
import type { ServerStatus, ServerSummary } from '@shared/servers'
import type { ServerManager } from '../servers/manager'
import type { SettingsStore } from '../settings'
import { logger } from '../log'
import { lanInfo } from './lan'
import { defaultGateway } from './gateway'
import { classifyIpv4, joinAddress } from './ipclass'
import { addMapping, deleteMapping, discoverIgd, externalIp, getMapping, UpnpError, type IgdService } from './upnp'
import { natPmpExternalIp, natPmpMap } from './natpmp'
import { checkFirewall, fixFirewall, type FixResult } from './firewall'
import { runDoctor } from './doctor'
import type { PlayitError, PlayitManager } from './playit'
import type { TaskManager } from '../tasks'

const log = logger('network')

const LEASE_SECONDS = 3600
const RENEW_MS = 30 * 60 * 1000
const FIREWALL_CACHE_MS = 60 * 1000

type Forward = { via: 'upnp'; svc: IgdService; port: number } | { via: 'natpmp'; gateway: string; port: number }

interface NetState {
  internet: ServerNetworkView['internet']
  forward: Forward | null
  wanIp: string | null
  /** What friends type in: "ip:port" for direct hosting, the tunnel's address for playit. */
  address: string | null
  renew: NodeJS.Timeout | null
  queue: Promise<void>
}

const MESSAGES: Record<InternetProblem, (port: number, extra?: string) => string> = {
  'tunnel-failed': (_p, extra) => `The playit.gg tunnel couldn't be set up${extra ? `: ${extra}` : '.'}`,
  'no-router-support': () =>
    "Your router didn't answer the automatic setup request. It may have UPnP turned off.",
  cgnat: () =>
    'Your internet provider shares one public address between many homes (CGNAT), so your router can’t be reached from outside.',
  'double-nat': () =>
    'There’s a second router in front of yours, so the automatic setup can’t reach the internet.',
  'port-taken': (port) => `Your router already sends port ${port} to another device on your network.`,
  'router-refused': (_p, extra) => `Your router refused the automatic setup${extra ? `: ${extra}` : '.'}`,
  vpn: (_p, extra) => `A VPN (${extra}) carries this PC’s internet traffic, so friends can’t reach it directly.`
}

export class NetworkManager extends EventEmitter<{ changed: [{ id: string; view: ServerNetworkView }] }> {
  private readonly states = new Map<string, NetState>()
  private readonly lastStatus = new Map<string, ServerStatus>()
  private readonly firewallCache = new Map<string, { at: number; value: FirewallView }>()
  private readonly firewallChecking = new Set<string>()

  constructor(
    private readonly deps: {
      servers: ServerManager
      settings: SettingsStore
      tasks: TaskManager
      playit: PlayitManager
      appPath: string
    }
  ) {
    super()
    deps.servers.on('changed', (s) => this.onServerChanged(s))
    deps.servers.on('removed', (id) => {
      void this.closeInternet(id)
      this.states.delete(id)
    })
  }

  private state(id: string): NetState {
    let s = this.states.get(id)
    if (!s) {
      s = {
        internet: { state: 'off', problem: null, message: '', via: null, router: null },
        forward: null,
        wanIp: null,
        address: null,
        renew: null,
        queue: Promise.resolve()
      }
      this.states.set(id, s)
    }
    return s
  }

  /** Runs network work for one server strictly one job at a time. */
  private serial(id: string, job: () => Promise<void>): Promise<void> {
    const s = this.state(id)
    s.queue = s.queue.then(job, job).catch((err) => log.error(`network job for ${id} failed`, err))
    return s.queue
  }

  private setInternet(id: string, patch: Partial<ServerNetworkView['internet']>): void {
    const s = this.state(id)
    s.internet = { ...s.internet, ...patch }
    void this.emitView(id)
  }

  private async emitView(id: string): Promise<void> {
    try {
      this.emit('changed', { id, view: await this.view(id) })
    } catch {
      // Server was removed meanwhile.
    }
  }

  async view(id: string, refreshFirewall = false): Promise<ServerNetworkView> {
    const server = this.deps.servers.get(id)
    const config = this.deps.servers.networkConfig(id)
    const port = server.config.port
    const lan = await lanInfo()
    const s = this.state(id)
    const running = server.status === 'running' || server.status === 'starting'
    let internet = s.internet
    if (config.audience !== 'internet') internet = { ...internet, state: 'off', problem: null, message: '' }
    else if (!running && internet.state !== 'needs-help') {
      internet = { ...internet, state: 'waiting', message: 'Friends anywhere can join once the server is running.' }
    }
    return {
      config,
      addresses: {
        thisPc: joinAddress('localhost', port),
        lan: lan.address ? joinAddress(lan.address, port) : null,
        internet: internet.state === 'ready' ? s.address : null
      },
      vpnActive: lan.vpnActive,
      firewall: refreshFirewall ? await this.firewall(id, true) : this.cachedFirewall(id),
      internet
    }
  }

  /**
   * The last firewall result, without waiting. The check takes a few seconds (PowerShell),
   * so a stale or missing result triggers a background refresh that emits a new view.
   */
  private cachedFirewall(id: string): FirewallView | null {
    const cached = this.firewallCache.get(id)
    if (!cached || Date.now() - cached.at > FIREWALL_CACHE_MS) {
      if (!this.firewallChecking.has(id)) {
        this.firewallChecking.add(id)
        void this.firewall(id, true)
          .then(() => this.emitView(id))
          .finally(() => this.firewallChecking.delete(id))
      }
    }
    return cached?.value ?? null
  }

  async firewall(id: string, refresh = false): Promise<FirewallView | null> {
    const cached = this.firewallCache.get(id)
    if (!refresh && cached && Date.now() - cached.at < FIREWALL_CACHE_MS) return cached.value
    const javaPath = await this.deps.servers.javaPathFor(id)
    if (!javaPath) return null
    const value = await checkFirewall(javaPath, this.deps.servers.get(id).config.port, this.deps.appPath)
    this.firewallCache.set(id, { at: Date.now(), value })
    return value
  }

  async fixFirewall(): Promise<FixResult> {
    const targets = await this.deps.servers.firewallTargets()
    const result = await fixFirewall({ ...targets, appPath: this.deps.appPath })
    this.firewallCache.clear()
    if (result === 'fixed') {
      // Router replies may have been blocked; give servers that failed another go.
      for (const s of this.deps.servers.list()) {
        const st = this.states.get(s.config.id)
        if (st?.internet.state === 'needs-help' && st.internet.problem === 'no-router-support') {
          void this.openInternet(s.config.id)
        }
        void this.emitView(s.config.id)
      }
    }
    return result
  }

  async setAudience(id: string, audience: Exclude<Audience, 'unset'>): Promise<ServerNetworkView> {
    await this.deps.servers.setNetwork(id, { audience })
    const status = this.deps.servers.get(id).status
    const live = status === 'running' || status === 'starting'
    if (live && audience === 'internet') void this.openInternet(id)
    else await this.closeInternet(id)
    return this.view(id)
  }

  retry(id: string): Promise<void> {
    return this.openInternet(id)
  }

  private onServerChanged(s: ServerSummary): void {
    const id = s.config.id
    const prev = this.lastStatus.get(id)
    this.lastStatus.set(id, s.status)
    if (prev === s.status) return
    const audience = this.deps.servers.networkConfig(id).audience
    if (s.status === 'starting' && audience === 'internet') void this.openInternet(id)
    if ((s.status === 'stopped' || s.status === 'crashed') && prev && prev !== 'installing') {
      void this.closeInternet(id)
    }
    void this.emitView(id)
  }

  /**
   * One click "use a tunnel": links playit.gg if needed (one-time browser approval),
   * switches the server to the tunnel and brings it up if the server is running.
   */
  useTunnel(id: string): string {
    const { id: taskId, result } = this.deps.tasks.run('Setting up the playit.gg tunnel', async (ctx) => {
      if (!(await this.deps.playit.status()).linked) await this.deps.playit.link(ctx)
      else await this.deps.playit.ensureAgent(ctx)
      await this.deps.servers.setNetwork(id, { method: 'playit', audience: 'internet' })
      const status = this.deps.servers.get(id).status
      if (status === 'running' || status === 'starting') {
        ctx.step('Creating your tunnel')
        await this.openInternet(id)
      } else void this.emitView(id)
    })
    result.catch(() => undefined)
    return taskId
  }

  /** Back to hosting straight from this PC through the router. */
  async useDirect(id: string): Promise<void> {
    await this.deps.servers.setNetwork(id, { method: 'direct' })
    const status = this.deps.servers.get(id).status
    if (status === 'running' || status === 'starting') await this.openInternet(id)
    else void this.emitView(id)
  }

  playitStatus(): ReturnType<PlayitManager['status']> {
    return this.deps.playit.status()
  }

  async unlinkPlayit(): Promise<void> {
    for (const s of this.deps.servers.list()) {
      if (this.deps.servers.networkConfig(s.config.id).method === 'playit') {
        await this.deps.servers.setNetwork(s.config.id, { method: 'direct', playitTunnelId: null })
      }
    }
    await this.deps.playit.unlink()
  }

  private anyPlayitRunning(except?: string): boolean {
    return this.deps.servers.list().some((s) => {
      if (s.config.id === except) return false
      const cfg = this.deps.servers.networkConfig(s.config.id)
      return (
        cfg.audience === 'internet' &&
        cfg.method === 'playit' &&
        (s.status === 'running' || s.status === 'starting')
      )
    })
  }

  private async openTunnel(id: string): Promise<void> {
    const server = this.deps.servers.get(id)
    const s = this.state(id)
    this.setInternet(id, { state: 'working', problem: null, via: 'playit', message: 'Starting the playit.gg tunnel…' })
    try {
      await this.deps.playit.startAgent()
      const cfg = this.deps.servers.networkConfig(id)
      // Right after the helper starts, playit hasn't registered it yet and refuses new
      // tunnels ("AgentVersionTooOld"); wait for it to connect instead of failing.
      let result: { tunnelId: string; address: string } | null = null
      for (let attempt = 0; !result; attempt++) {
        try {
          result = await this.deps.playit.ensureTunnel({
            tunnelId: cfg.playitTunnelId,
            name: server.config.name,
            port: server.config.port
          })
        } catch (err) {
          const code = (err as PlayitError).code
          if (attempt >= 15 || (code !== 'AgentVersionTooOld' && code !== 'AgentNotFound')) throw err
          await new Promise((r) => setTimeout(r, 2000))
        }
      }
      const { tunnelId, address } = result
      if (tunnelId !== cfg.playitTunnelId) await this.deps.servers.setNetwork(id, { playitTunnelId: tunnelId })
      s.address = address
      this.setInternet(id, {
        state: 'ready',
        problem: null,
        via: 'playit',
        message: 'Friends anywhere can join through your playit.gg tunnel (a free third-party service).'
      })
    } catch (err) {
      log.warn('playit tunnel failed', err)
      this.setInternet(id, {
        state: 'needs-help',
        problem: 'tunnel-failed',
        message: MESSAGES['tunnel-failed'](server.config.port, (err as Error).message)
      })
    }
  }

  /** Makes the server reachable from the internet with the chosen method. */
  openInternet(id: string): Promise<void> {
    return this.serial(id, async () => {
      const server = this.deps.servers.get(id)
      const port = server.config.port
      const s = this.state(id)
      const fail = (problem: InternetProblem, extra?: string): void =>
        this.setInternet(id, { state: 'needs-help', problem, message: MESSAGES[problem](port, extra) })

      await this.releaseForward(id)
      if (this.deps.servers.networkConfig(id).method === 'playit') return this.openTunnel(id)
      this.setInternet(id, { state: 'working', problem: null, message: 'Asking your router to let friends in…' })
      const lan = await lanInfo()
      if (lan.vpnActive) return fail('vpn', lan.vpnActive)
      if (!lan.address) return fail('router-refused', 'this PC is not on a home network')
      const description = `Pughcraft: ${server.config.name}`.slice(0, 60)

      const svc = await discoverIgd(lan.address)
      if (svc) {
        const wan = await externalIp(svc).catch(() => null)
        this.setInternet(id, { router: { manufacturer: svc.router.manufacturer, model: svc.router.model } })
        const kind = wan ? classifyIpv4(wan) : null
        if (kind === 'cgnat') return fail('cgnat')
        if (kind === 'private') return fail('double-nat')
        try {
          await addMapping(svc, { port, internalClient: lan.address, description, leaseSeconds: LEASE_SECONDS })
        } catch (err) {
          const existing = await getMapping(svc, port).catch(() => null)
          if (existing && existing.internalClient !== lan.address) return fail('port-taken')
          if (!existing) {
            log.warn('UPnP mapping refused', err)
            return fail('router-refused', err instanceof UpnpError ? err.message : undefined)
          }
        }
        s.forward = { via: 'upnp', svc, port }
        s.wanIp = wan
        s.address = wan ? joinAddress(wan, port) : null
        this.scheduleRenew(id)
        return this.setInternet(id, {
          state: 'ready',
          problem: null,
          via: 'upnp',
          message: 'Your router opened the door automatically. Friends anywhere can join.'
        })
      }

      const gateway = await defaultGateway(lan.address)
      if (gateway) {
        try {
          const wan = await natPmpExternalIp(gateway)
          const kind = classifyIpv4(wan)
          if (kind === 'cgnat') return fail('cgnat')
          if (kind === 'private') return fail('double-nat')
          await natPmpMap(gateway, port, LEASE_SECONDS)
          s.forward = { via: 'natpmp', gateway, port }
          s.wanIp = wan
          s.address = joinAddress(wan, port)
          this.scheduleRenew(id)
          return this.setInternet(id, {
            state: 'ready',
            problem: null,
            via: 'natpmp',
            message: 'Your router opened the door automatically. Friends anywhere can join.'
          })
        } catch (err) {
          log.info(`NAT-PMP not available: ${(err as Error).message}`)
        }
      }
      fail('no-router-support')
    })
  }

  private scheduleRenew(id: string): void {
    const s = this.state(id)
    if (s.renew) clearInterval(s.renew)
    s.renew = setInterval(() => {
      const status = this.deps.servers.get(id).status
      if (status === 'running' || status === 'starting') void this.openInternet(id)
    }, RENEW_MS)
  }

  private async releaseForward(id: string): Promise<void> {
    const s = this.state(id)
    if (s.renew) clearInterval(s.renew)
    s.renew = null
    const fwd = s.forward
    s.forward = null
    if (!fwd) return
    try {
      if (fwd.via === 'upnp') await deleteMapping(fwd.svc, fwd.port)
      else await natPmpMap(fwd.gateway, fwd.port, 0)
      log.info(`closed router port ${fwd.port}`)
    } catch (err) {
      log.warn(`could not close router port ${fwd.port}`, err)
    }
  }

  /** Closes the router forward / tunnel when a server stops, so nothing stays open for no reason. */
  closeInternet(id: string): Promise<void> {
    return this.serial(id, async () => {
      await this.releaseForward(id)
      const s = this.state(id)
      s.wanIp = null
      s.address = null
      s.internet = { ...s.internet, state: 'off', problem: null, message: '', via: null }
      // The tunnel itself stays on playit.gg (same address next time); only the helper stops.
      if (!this.anyPlayitRunning(id)) this.deps.playit.stopAgent()
      await this.emitView(id)
    })
  }

  async shutdown(): Promise<void> {
    await Promise.all([...this.states.keys()].map((id) => this.closeInternet(id)))
    this.deps.playit.stopAgent()
  }

  async doctor(id: string): Promise<DoctorReport> {
    const view = await this.view(id, true)
    const server = this.deps.servers.get(id)
    return runDoctor({
      status: server.status,
      port: server.config.port,
      config: view.config,
      view,
      firewall: view.firewall,
      routerWanIp: this.state(id).wanIp,
      allowOutside: this.deps.settings.get().outsideChecks === 'on-demand'
    })
  }
}
