import type {
  DoctorCheck,
  DoctorReport,
  FirewallView,
  ServerNetworkConfig,
  ServerNetworkView
} from '@shared/network'
import type { ServerStatus } from '@shared/servers'
import { pingServer } from './ping'
import { classifyIpv4 } from './ipclass'
import { lookupPublicIp, probeFromInternet } from './outside'

export interface DoctorInput {
  status: ServerStatus
  port: number
  config: ServerNetworkConfig
  view: ServerNetworkView
  firewall: FirewallView | null
  /** Router's public address as reported by UPnP / NAT-PMP, if known. */
  routerWanIp: string | null
  allowOutside: boolean
}

const verdict = (
  level: DoctorReport['verdict']['level'],
  title: string,
  body: string,
  fix: DoctorReport['verdict']['fix'] = null
): DoctorReport['verdict'] => ({ level, title, body, fix })

/**
 * Walks from "is the server even running" out to "can the internet reach it", stopping at the
 * first real problem, and turns it into ONE plain-English answer with a fix.
 */
export async function runDoctor(input: DoctorInput): Promise<DoctorReport> {
  const checks: DoctorCheck[] = []
  const add = (c: DoctorCheck): void => void checks.push(c)
  const report = (v: DoctorReport['verdict'], usedOutside = false): DoctorReport => ({
    verdict: v,
    checks,
    usedOutsideServices: usedOutside,
    finishedAt: new Date().toISOString()
  })
  const { config, view, port } = input

  // 1. Running and answering on this PC.
  if (input.status !== 'running') {
    add({ id: 'running', label: 'Server is running', status: 'fail', detail: 'The server is not running.' })
    return report(verdict('problem', 'The server is off', 'Start the server, then friends can try to join.', 'start-server'))
  }
  const local = await pingServer('127.0.0.1', port)
  if (!local.online) {
    add({ id: 'local', label: 'Answers on this PC', status: 'fail', detail: `No answer on port ${port} (${local.error}).` })
    return report(
      verdict('problem', "The server isn't answering", 'It is running but not accepting players yet. Check the Console tab for errors.')
    )
  }
  add({ id: 'local', label: 'Answers on this PC', status: 'pass', detail: `Minecraft ${local.version ?? ''} answered in ${local.latencyMs} ms.` })

  if (config.audience === 'unset' || config.audience === 'self') {
    return report(
      config.audience === 'unset'
        ? verdict('warning', "You haven't said who's playing", 'Choose who should be able to join this server.', 'choose-audience')
        : verdict('ok', 'Ready on this PC', `Join from this PC at ${view.addresses.thisPc}. Only you can join right now.`)
    )
  }

  // 2. VPN carrying traffic.
  if (view.vpnActive) {
    add({ id: 'vpn', label: 'No VPN in the way', status: 'fail', detail: `${view.vpnActive} is carrying this PC's internet traffic.` })
    return report(
      verdict(
        'problem',
        'A VPN is in the way',
        `${view.vpnActive} sends all of this PC's traffic elsewhere, so friends can't reach you. Turn the VPN off while hosting, or allow local network traffic in its settings.`,
        'vpn'
      )
    )
  }
  add({ id: 'vpn', label: 'No VPN in the way', status: 'pass', detail: 'Traffic goes through your home network.' })

  // 3. Firewall.
  const fw = input.firewall
  if (fw && (fw.state === 'blocked' || fw.state === 'not-allowed')) {
    add({ id: 'firewall', label: 'Firewall lets friends in', status: 'fail', detail: fw.detail })
    return report(
      verdict(
        'problem',
        fw.state === 'blocked' ? 'Your firewall is blocking the server' : "Your firewall hasn't allowed the server yet",
        `${fw.detail} One click fixes it; your PC will ask for permission.`,
        'firewall'
      )
    )
  }
  add({
    id: 'firewall',
    label: 'Firewall lets friends in',
    status: fw?.state === 'unknown' ? 'warn' : 'pass',
    detail: fw?.detail ?? 'No firewall to check.'
  })

  // 4. Same Wi-Fi.
  if (!view.addresses.lan) {
    add({ id: 'lan', label: 'Connected to a home network', status: 'fail', detail: 'No home network address found.' })
    return report(verdict('problem', "This PC isn't on a home network", 'Connect to your Wi-Fi or router, then try again.'))
  }
  add({ id: 'lan', label: 'Connected to a home network', status: 'pass', detail: `Friends on your Wi-Fi use ${view.addresses.lan}.` })
  if (config.audience === 'lan') {
    return report(verdict('ok', 'Friends on your Wi-Fi can join', `They join at ${view.addresses.lan}. People elsewhere can't, which is what you chose.`))
  }

  // 5. Router / tunnel path.
  const net = view.internet
  const tunnel = config.method === 'playit' || config.method === 'bore' || config.method === 'custom'
  const pathLabel = tunnel
    ? 'Tunnel set up'
    : config.method === 'manual'
      ? 'Your port forwarding'
      : 'Router set up'
  if (net.state === 'working') {
    add({ id: 'router', label: pathLabel, status: 'skip', detail: net.message })
    return report(verdict('warning', 'Still setting up', `${net.message} Try again in a few seconds.`))
  }
  if (net.state === 'needs-help' && tunnel) {
    add({ id: 'router', label: pathLabel, status: 'fail', detail: net.message })
    return report(verdict('problem', "The tunnel isn't working", net.message, 'tunnel'))
  }
  if (net.state === 'needs-help') {
    add({ id: 'router', label: pathLabel, status: 'fail', detail: net.message })
    const tunnelBody = ' A tunnel gets friends in without touching the router; it takes one click.'
    switch (net.problem) {
      case 'cgnat':
        return report(verdict('problem', 'Your internet provider blocks hosting', net.message + tunnelBody, 'tunnel'))
      case 'double-nat':
        return report(verdict('problem', 'There are two routers in the way', net.message + tunnelBody, 'tunnel'))
      case 'port-taken':
        return report(verdict('problem', 'The port is taken on your router', net.message, 'guide'))
      case 'need-public-ip':
        return report(verdict('warning', 'Your internet address is unknown', net.message))
      default: {
        const hint =
          fw?.networkCategory === 'Public' && !fw.routerRepliesAllowed
            ? ' Windows treats this network as Public, which can hide the router’s answer; allowing Pughcraft through the firewall fixes that.'
            : ''
        return report(
          verdict(
            'problem',
            "Your router didn't open the door automatically",
            net.message + hint + tunnelBody,
            hint ? 'firewall' : 'tunnel'
          )
        )
      }
    }
  }
  if (net.state !== 'ready' || !view.addresses.internet) {
    add({ id: 'router', label: pathLabel, status: 'skip', detail: net.message })
    return report(verdict('warning', 'Internet access is not set up yet', net.message, 'retry-router'))
  }
  add({ id: 'router', label: pathLabel, status: 'pass', detail: net.message })

  // 6. From the outside (opt-in).
  if (!input.allowOutside) {
    add({ id: 'outside', label: 'Reachable from the internet', status: 'skip', detail: 'Outside test not allowed in Settings.' })
    return report(
      verdict(
        'ok',
        'Friends anywhere should be able to join',
        `They join at ${view.addresses.internet}. (The final test from outside your network was skipped because it's turned off.)`
      )
    )
  }
  // A tunnel doesn't depend on the home connection's address, so test it directly.
  const publicIp = tunnel ? null : await lookupPublicIp()
  const wan = input.routerWanIp
  if (!tunnel && publicIp && wan && publicIp !== wan && classifyIpv4(wan) !== 'public') {
    add({ id: 'cgnat', label: 'Your own internet address', status: 'fail', detail: `Router says ${wan}, the internet sees ${publicIp}.` })
    return report(
      verdict(
        'problem',
        'Your internet provider blocks hosting',
        'Your provider shares one internet address between many homes (CGNAT), so nobody outside can reach your router. A tunnel fixes this in one click.',
        'tunnel'
      ),
      true
    )
  }
  if (!tunnel) {
    add({ id: 'cgnat', label: 'Your own internet address', status: 'pass', detail: publicIp ? `The internet sees ${publicIp}.` : 'Could not look it up.' })
  }

  const host = publicIp ?? wan
  const target = tunnel ? view.addresses.internet : host ? `${host}:${port}` : null
  const probe = target ? await probeFromInternet(target) : null
  if (!probe) {
    add({ id: 'outside', label: 'Reachable from the internet', status: 'warn', detail: "The outside test service didn't answer." })
    return report(
      verdict('warning', 'Probably working', `Your router is set up, but the outside test couldn't run. Friends can try ${view.addresses.internet}.`),
      true
    )
  }
  if (!probe.reachable) {
    add({ id: 'outside', label: 'Reachable from the internet', status: 'fail', detail: 'mcstatus.io could not reach the server.' })
    const cacheNote = ' (If you just fixed something, the test service remembers old results for about a minute.)'
    return report(
      tunnel
        ? verdict(
            'problem',
            "The tunnel isn't reaching your server",
            'The tunnel is set up, but a test from outside could not get through. If you use playit.gg, check that the tunnel is enabled on playit.gg.' + cacheNote,
            'tunnel'
          )
        : verdict(
            'problem',
            "The internet still can't reach your server",
            'Your router accepted the setup, but a test from outside failed. Your internet provider may block incoming connections.' + cacheNote + ' A tunnel works around this.',
            'tunnel'
          ),
      true
    )
  }
  add({ id: 'outside', label: 'Reachable from the internet', status: 'pass', detail: 'mcstatus.io reached the server from outside.' })
  return report(verdict('ok', 'Friends anywhere can join', `Everything checks out. Share ${view.addresses.internet} with your friends.`), true)
}
