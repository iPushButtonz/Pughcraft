import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import { logger } from '../log'

const run = promisify(execFile)
const log = logger('firewall')

/** Our allow rule covers the ports the app hands out automatically. */
export const AUTO_PORT_RANGE = { from: 25565, to: 25664 }
const RULE_GROUP = 'Pughcraft'

export interface FirewallStatus {
  /** 'unknown' when the check itself failed (e.g. PowerShell unavailable). */
  state: 'ok' | 'blocked' | 'not-allowed' | 'off' | 'unknown'
  /** Windows network category of the active connection. 'Public' blocks router replies. */
  networkCategory: 'Public' | 'Private' | 'DomainAuthenticated' | null
  /** Our UDP rule letting router replies (UPnP/NAT-PMP) reach the app. */
  routerRepliesAllowed: boolean
  detail: string
}

function psEncoded(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

async function powershell(script: string, timeout = 20_000): Promise<string> {
  const { stdout } = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', psEncoded(script)],
    { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 }
  )
  return stdout
}

const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`

interface RuleInfo {
  name: string
  action: string
  profile: string
  protocol: string
  localPort: string
}

function portMatches(spec: string, port: number): boolean {
  if (!spec || spec === 'Any') return true
  return spec.split(',').some((part) => {
    const [a, b] = part.trim().split('-').map(Number)
    return b === undefined ? a === port : port >= a && port <= b
  })
}

function profileMatches(ruleProfile: string, category: string | null): boolean {
  if (!ruleProfile || ruleProfile === 'Any') return true
  const wanted = category === 'DomainAuthenticated' ? 'Domain' : (category ?? 'Public')
  return ruleProfile.split(',').map((p) => p.trim()).includes(wanted)
}

/** Read-only: would Windows Firewall let friends reach `javaPath` on `port`? */
export async function checkFirewall(javaPath: string, port: number, appPath: string): Promise<FirewallStatus> {
  if (process.platform !== 'win32') return checkLinuxFirewall(port)
  try {
    const out = await powershell(`
      $ErrorActionPreference = 'SilentlyContinue'
      function Rules($prog) {
        Get-NetFirewallApplicationFilter -Program $prog | Get-NetFirewallRule |
          Where-Object { $_.Direction -eq 'Inbound' -and $_.Enabled -eq 'True' } | ForEach-Object {
            $pf = $_ | Get-NetFirewallPortFilter
            [pscustomobject]@{ name = $_.DisplayName; action = "$($_.Action)"; profile = "$($_.Profile)"; protocol = "$($pf.Protocol)"; localPort = "$($pf.LocalPort)" }
          }
      }
      $java = @(Rules ${psQuote(javaPath)})
      $app = @(Rules ${psQuote(appPath)})
      $cat = (Get-NetConnectionProfile | Sort-Object -Property InterfaceMetric | Select-Object -First 1).NetworkCategory
      $on = @(Get-NetFirewallProfile | Where-Object { $_.Enabled } | ForEach-Object { "$($_.Name)" })
      @{ java = $java; app = $app; category = "$cat"; enabled = $on } | ConvertTo-Json -Depth 4 -Compress
    `)
    const data = JSON.parse(out.trim() || '{}') as {
      java?: RuleInfo[] | RuleInfo
      app?: RuleInfo[] | RuleInfo
      category?: string
      enabled?: string[] | string
    }
    const list = <T>(v: T[] | T | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
    const category = (['Public', 'Private', 'DomainAuthenticated'].includes(data.category ?? '')
      ? data.category
      : null) as FirewallStatus['networkCategory']
    const enabled = list(data.enabled)
    const activeProfile = category === 'DomainAuthenticated' ? 'Domain' : (category ?? 'Public')
    const routerRepliesAllowed = list(data.app).some(
      (r) => r.action === 'Allow' && /UDP|Any/i.test(r.protocol) && profileMatches(r.profile, category)
    )
    if (!enabled.includes(activeProfile)) {
      return { state: 'off', networkCategory: category, routerRepliesAllowed: true, detail: 'Windows Firewall is off for this network.' }
    }
    const relevant = list(data.java).filter(
      (r) => /TCP|Any/i.test(r.protocol) && portMatches(r.localPort, port) && profileMatches(r.profile, category)
    )
    const block = relevant.find((r) => r.action === 'Block')
    if (block) {
      return {
        state: 'blocked',
        networkCategory: category,
        routerRepliesAllowed,
        detail: `Windows Firewall has a rule blocking Java ("${block.name}"). This usually happens when someone clicked Cancel on the Windows popup.`
      }
    }
    if (relevant.some((r) => r.action === 'Allow')) {
      return { state: 'ok', networkCategory: category, routerRepliesAllowed, detail: 'Windows Firewall allows the server.' }
    }
    return {
      state: 'not-allowed',
      networkCategory: category,
      routerRepliesAllowed,
      detail: 'Windows Firewall has not been told to let friends reach the server yet.'
    }
  } catch (err) {
    log.warn('firewall check failed', err)
    return { state: 'unknown', networkCategory: null, routerRepliesAllowed: false, detail: "Couldn't check Windows Firewall." }
  }
}

async function checkLinuxFirewall(port: number): Promise<FirewallStatus> {
  // ufw keeps its on/off switch in a world-readable file; firewalld answers without root.
  try {
    if (existsSync('/etc/ufw/ufw.conf') && /^ENABLED=yes/m.test(await readFile('/etc/ufw/ufw.conf', 'utf8'))) {
      const rules = await readFile('/etc/ufw/user.rules', 'utf8').catch(() => '')
      const allowed = new RegExp(`--dport ${port}\\b[^\\n]*-j ACCEPT`).test(rules)
      return {
        state: allowed ? 'ok' : 'not-allowed',
        networkCategory: null,
        routerRepliesAllowed: true,
        detail: allowed ? 'ufw allows the server port.' : `ufw is on and port ${port} is not allowed yet.`
      }
    }
    const { stdout } = await run('firewall-cmd', ['--state'], { timeout: 5000 }).catch(() => ({ stdout: '' }))
    if (stdout.trim() === 'running') {
      const { stdout: ports } = await run('firewall-cmd', ['--list-ports'], { timeout: 5000 }).catch(() => ({ stdout: '' }))
      const allowed = ports.split(/\s+/).includes(`${port}/tcp`)
      return {
        state: allowed ? 'ok' : 'not-allowed',
        networkCategory: null,
        routerRepliesAllowed: true,
        detail: allowed ? 'firewalld allows the server port.' : `firewalld is on and port ${port} is not open yet.`
      }
    }
  } catch (err) {
    log.warn('linux firewall check failed', err)
  }
  return { state: 'off', networkCategory: null, routerRepliesAllowed: true, detail: 'No active firewall found.' }
}

export type FixResult = 'fixed' | 'cancelled' | 'failed'

/**
 * Asks for administrator rights once (UAC on Windows, pkexec on Linux) and:
 * removes Windows' block rules for our Java, allows our Java on the server ports,
 * and lets router replies reach the app from the local network only.
 */
export async function fixFirewall(opts: { javaPaths: string[]; ports: number[]; appPath: string }): Promise<FixResult> {
  if (process.platform !== 'win32') return fixLinuxFirewall(opts.ports)
  const extraPorts = opts.ports.filter((p) => p < AUTO_PORT_RANGE.from || p > AUTO_PORT_RANGE.to)
  const portSpec = [`${AUTO_PORT_RANGE.from}-${AUTO_PORT_RANGE.to}`, ...extraPorts.map(String)]
  const marker = join(tmpdir(), `pughcraft-fw-${randomBytes(4).toString('hex')}.txt`)
  const inner = `
    $ErrorActionPreference = 'Stop'
    try {
      foreach ($p in @(${opts.javaPaths.map(psQuote).join(',')})) {
        Get-NetFirewallApplicationFilter -Program $p -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue |
          Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' } | Remove-NetFirewallRule
        Get-NetFirewallApplicationFilter -Program $p -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue |
          Where-Object { $_.Group -eq '${RULE_GROUP}' } | Remove-NetFirewallRule
        New-NetFirewallRule -DisplayName 'Pughcraft - Minecraft server' -Group '${RULE_GROUP}' -Direction Inbound -Program $p -Protocol TCP -LocalPort @(${portSpec.map(psQuote).join(',')}) -Action Allow -Profile Any -Description 'Lets friends join Minecraft servers run by Pughcraft.' | Out-Null
      }
      Get-NetFirewallApplicationFilter -Program ${psQuote(opts.appPath)} -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue |
        Where-Object { $_.Group -eq '${RULE_GROUP}' } | Remove-NetFirewallRule
      New-NetFirewallRule -DisplayName 'Pughcraft - router replies' -Group '${RULE_GROUP}' -Direction Inbound -Program ${psQuote(opts.appPath)} -Protocol UDP -RemoteAddress LocalSubnet -Action Allow -Profile Any -Description 'Lets Pughcraft hear the router when it sets up port forwarding (UPnP / NAT-PMP).' | Out-Null
      Set-Content -Path ${psQuote(marker)} -Value 'ok'
    } catch { Set-Content -Path ${psQuote(marker)} -Value ('error: ' + $_.Exception.Message) }
  `
  const outer = `
    try {
      Start-Process -FilePath powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${psEncoded(inner)}')
    } catch { exit 3 }
  `
  const code = await new Promise<number>((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', psEncoded(outer)], {
      windowsHide: true
    })
    child.on('close', (c) => resolve(c ?? 1))
    child.on('error', () => resolve(1))
  })
  const result = existsSync(marker) ? (await readFile(marker, 'utf8')).trim() : ''
  await rm(marker, { force: true })
  if (code === 3 || !result) return 'cancelled'
  if (result === 'ok') return 'fixed'
  log.error(`firewall fix failed: ${result}`)
  return 'failed'
}

async function fixLinuxFirewall(ports: number[]): Promise<FixResult> {
  const status = await checkLinuxFirewall(ports[0])
  if (status.state === 'off') return 'fixed'
  const usesUfw = existsSync('/etc/ufw/ufw.conf')
  const cmds = usesUfw
    ? ports.map((p) => `ufw allow ${p}/tcp`)
    : [...ports.map((p) => `firewall-cmd --permanent --add-port=${p}/tcp`), 'firewall-cmd --reload']
  try {
    await run('pkexec', ['sh', '-c', cmds.join(' && ')], { timeout: 120_000 })
    return 'fixed'
  } catch (err) {
    // pkexec exits 126 when the user dismisses the password dialog.
    return (err as { code?: number }).code === 126 ? 'cancelled' : 'failed'
  }
}
