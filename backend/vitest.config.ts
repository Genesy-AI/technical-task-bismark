import { defineConfig } from 'vitest/config'
import path from 'path'
import { TEST_DATABASE_URL } from './src/test/globalSetup'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
    },
    globalSetup: './src/test/globalSetup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**'],
      exclude: ['src/worker.ts', 'src/test/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
