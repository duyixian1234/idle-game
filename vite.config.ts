import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: false,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
