import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  },
  resolve: {
    alias: {
      '@engine': resolve(__dirname, 'src/engine'),
      '@ai': resolve(__dirname, 'src/ai'),
      '@net': resolve(__dirname, 'src/net')
    }
  }
})
