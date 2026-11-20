import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname),
  css: false,
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.*',
        '**/__tests__/**',
        '**/scripts/**',
      ],
    },
    testTimeout: 10000,
    // The *.db.test.ts suites share one database and wipe/assign its reports
    // (auto-assign takes every unassigned report), so they must not overlap.
    fileParallelism: !process.env.DATABASE_TEST_URL,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})





