import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    setupFiles: ['./server/__helpers__/setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, '.'),
    },
  },
})
