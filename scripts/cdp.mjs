// Dev helper: drives the running dev app over the Chrome DevTools Protocol.
// Start the app with `npm run dev:debug`, then:
//   node scripts/cdp.mjs shot out.png          screenshot of the window
//   node scripts/cdp.mjs eval "document.title"  run JS in the UI, print the result
//   node scripts/cdp.mjs click "button[aria-current]"
//   node scripts/cdp.mjs clicktext "Settings"   click the first button/link with that text
//   node scripts/cdp.mjs main "<js>"            run JS in the main process (`electron` is in scope)
//   node scripts/cdp.mjs pages                  list open windows
import { writeFile } from 'node:fs/promises'

const [, , command, arg] = process.argv
const mainProcess = command === 'main'
const port = mainProcess ? '9229' : '9222'

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
if (command === 'pages') {
  console.log(targets.map((t) => `${t.type} ${t.url}`).join('\n') || '(none)')
  process.exit(0)
}
const target = mainProcess
  ? targets[0]
  : targets.find(
      (t) =>
        t.type === 'page' && (t.url.startsWith('http://localhost') || t.url.startsWith('file://'))
    )
if (!target) throw new Error('target not found; is `npm run dev:debug` running?')

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})
let nextId = 1
const pending = new Map()
const events = []
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data)
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data)
    pending.delete(data.id)
  } else if (data.method) {
    events.push(data)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, (d) => (d.error ? reject(new Error(d.error.message)) : resolve(d.result)))
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result.value
}

if (command === 'errors') {
  // Reloads the UI and prints any exceptions or console errors during startup.
  await send('Runtime.enable')
  await send('Page.enable')
  events.length = 0
  await send('Page.reload')
  await new Promise((r) => setTimeout(r, Number(arg ?? 5000)))
  for (const e of events) {
    if (e.method === 'Runtime.exceptionThrown') {
      console.log('EXCEPTION', e.params.exceptionDetails.exception?.description ?? e.params.exceptionDetails.text)
    } else if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) {
      console.log(e.params.type.toUpperCase(), e.params.args.map((a) => a.value ?? a.description).join(' '))
    }
  }
  console.log('done')
} else if (command === 'shot') {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(arg ?? 'shot.png', Buffer.from(data, 'base64'))
  console.log(`saved ${arg ?? 'shot.png'}`)
} else if (command === 'eval') {
  console.log(JSON.stringify(await evaluate(arg), null, 2))
} else if (mainProcess) {
  const code = `(async () => { const electron = process.mainModule.require('electron'); return (${arg}) })()`
  console.log(JSON.stringify(await evaluate(code), null, 2))
} else if (command === 'click') {
  console.log(
    await evaluate(
      `(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return 'not found'; el.click(); return 'clicked' })()`
    )
  )
} else if (command === 'clicktext') {
  console.log(
    await evaluate(`(() => {
      const want = ${JSON.stringify(arg)}.toLowerCase()
      const el = [...document.querySelectorAll('button, a, [role=radio], [role=switch], label')]
        .find((e) => e.textContent.trim().toLowerCase() === want)
      if (!el) return 'not found'
      el.click()
      return 'clicked'
    })()`)
  )
} else {
  console.log('commands: shot <file> | eval <js> | click <selector> | clicktext <text>')
}
ws.close()
