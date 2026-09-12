import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@engine': resolve('src/engine'),
        '@ai': resolve('src/ai'),
        '@net': resolve('src/net')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@engine': resolve('src/engine'),
        '@ai': resolve('src/ai'),
        '@net': resolve('src/net')
      }
    }
  }
})
