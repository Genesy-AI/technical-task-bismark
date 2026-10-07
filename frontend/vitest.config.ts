import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/globalTypes.d.ts',
        'src/api/types/**',
        'src/api/mutations/useApiMutation.ts',
        'src/test/**',
      ],
      // Floor pinned to today's baseline (`pnpm test:coverage`) — coverage may only go up.
      // Raise these numbers in the same commit that adds the coverage; never lower them to
      // make a commit pass.
      thresholds: {
        statements: 99.77,
        branches: 98.14,
        functions: 93.54,
        lines: 99.77,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
