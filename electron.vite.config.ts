import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const sharedAlias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    build: { externalizeDeps: true }
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: { externalizeDeps: true }
  },
  renderer: {
    resolve: { alias: { '@': resolve('src/renderer/src'), ...sharedAlias } },
    plugins: [react(), tailwindcss()]
  }
})
