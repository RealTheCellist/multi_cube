import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// package.json has "type": "module", so this config runs as ESM --
// __dirname isn't defined there, hence deriving it from import.meta.url.
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/multi_cube/' : '/',
  plugins: [react()],
  build: {
    // Vite's injected modulepreload polyfill assumes a DOM (`document`)
    // context. cubing.js's scramble/solve search runs in a Web Worker, and
    // that polyfill getting bundled into the worker chunk crashes it with
    // "document is not defined" in production builds. There's no per-chunk
    // opt-out, so disable it globally — we don't rely on it elsewhere.
    modulePreload: false,
    rollupOptions: {
      // Without this, `vite build` only ever emits index.html -- dev-only
      // lab pages (model-lab.html, tetra-lab.html) work fine under `vite
      // dev` (which serves any .html file by path) but never reach the
      // GitHub Pages deploy. Adding them as extra entries makes them real,
      // linkable (if unlisted) pages on the live site for on-device
      // checks, alongside the main app -- harmless to it since each entry
      // gets its own independent HTML/JS output.
      input: {
        main: resolve(__dirname, 'index.html'),
        modelLab: resolve(__dirname, 'model-lab.html'),
        tetraLab: resolve(__dirname, 'tetra-lab.html'),
      },
    },
  },
})
