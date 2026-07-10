import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
  },
})
