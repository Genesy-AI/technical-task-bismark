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
      // Floor pinned to today's baseline (`pnpm test:coverage`) — coverage may only go up.
      // Raise these numbers in the same commit that adds the coverage; never lower them to
      // make a commit pass.
      thresholds: {
        statements: 100,
        branches: 95.51,
        functions: 100,
        lines: 100,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
