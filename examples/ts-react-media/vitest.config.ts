import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    name: 'ts-react-media',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    watch: false,
  },
})
