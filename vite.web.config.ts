import { defineConfig } from 'vite'
import { resolve } from 'path'

// Plain-browser build of the renderer only (no Electron main/preload).
// `window.gd` is undefined at runtime here, and the app already degrades
// gracefully: solo play vs bots works fully, LAN/Steam multiplayer shows
// a "desktop app only" message instead of erroring.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@engine': resolve(__dirname, 'src/engine'),
      '@ai': resolve(__dirname, 'src/ai'),
      '@net': resolve(__dirname, 'src/net')
    }
  }
})
