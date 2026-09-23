// Renders the app and tray icons from one SVG. Run with `npm run icons`.
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const block = `
  <polygon points="256,120 400,200 256,280 112,200" fill="#6cc24a"/>
  <polygon points="112,200 256,280 256,440 112,360" fill="#8b5a2b"/>
  <polygon points="256,280 400,200 400,360 256,440" fill="#6e4520"/>
  <polygon points="112,200 256,280 256,318 112,238" fill="#4f9a37"/>
  <polygon points="256,280 400,200 400,238 256,318" fill="#3f7f2c"/>
  <polygon points="256,120 400,200 368,218 256,156 144,218 112,200" fill="#86d764"/>
  <rect x="140" y="268" width="22" height="22" fill="#6e4520" transform="skewY(29)"/>
  <rect x="190" y="300" width="22" height="22" fill="#a06a36" transform="skewY(29)"/>
`

// App icon: the block on a dark rounded tile.
const appSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#34402e"/><stop offset="1" stop-color="#1b2218"/>
    </linearGradient>
  </defs>
  <rect x="16" y="16" width="480" height="480" rx="104" fill="url(#bg)"/>
  <g transform="translate(0 -24)">${block}</g>
</svg>`

// Tray icon: the block alone, cropped tight so it reads at 16-32 px.
const traySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="104 112 304 336">${block}</svg>`

await mkdir('resources', { recursive: true })
await mkdir('build', { recursive: true })
await sharp(Buffer.from(appSvg)).resize(512, 512).png().toFile('resources/icon.png')
await sharp(Buffer.from(appSvg)).resize(512, 512).png().toFile('build/icon.png')
await sharp(Buffer.from(traySvg)).resize(32, 32).png().toFile('resources/tray.png')
console.log('icons written: resources/icon.png, resources/tray.png, build/icon.png')
