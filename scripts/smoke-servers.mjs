// Dev helper: starts each named server in the running dev app, waits until it is online
// (or fails), reports, then stops it. Usage: node scripts/smoke-servers.mjs "Test Paper" "Old Forge"
import { execFileSync } from 'node:child_process'

const evalJs = (js) =>
  JSON.parse(execFileSync('node', ['scripts/cdp.mjs', 'eval', js], { encoding: 'utf8' }))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const names = process.argv.slice(2)
const servers = evalJs('window.pughcraft.servers.list()')
for (const name of names) {
  const s = servers.find((x) => x.config.name === name)
  if (!s) {
    console.log(`${name}: not found`)
    continue
  }
  const id = s.config.id
  const t0 = Date.now()
  try {
    evalJs(`window.pughcraft.servers.start(${JSON.stringify(id)}).then(() => 'ok')`)
  } catch (err) {
    console.log(`${name}: start failed: ${err.message.split('\n')[0]}`)
    continue
  }
  let status = 'starting'
  let problem = null
  while (Date.now() - t0 < 300_000) {
    await sleep(3000)
    const now = evalJs(
      `window.pughcraft.servers.list().then(l => l.find(x => x.config.id === ${JSON.stringify(id)}))`
    )
    status = now.status
    problem = now.problem
    if (status !== 'starting') break
  }
  const secs = Math.round((Date.now() - t0) / 1000)
  const tail = evalJs(
    `window.pughcraft.servers.console(${JSON.stringify(id)}).then(l => l.slice(-4).map(x => x.text.slice(0, 140)))`
  )
  console.log(`\n${name} (${s.config.mcVersion} ${s.config.loader}): ${status} after ${secs}s${problem ? ` — ${problem}` : ''}`)
  for (const line of tail) console.log(`   ${line}`)
  if (status === 'running') {
    evalJs(`window.pughcraft.servers.stop(${JSON.stringify(id)}).then(() => 'stopped')`)
    console.log('   stopped cleanly')
  }
}
