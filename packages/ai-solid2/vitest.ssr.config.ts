import { defineConfig } from 'vitest/config'
import solid from '@solidjs/vite-plugin'

export default defineConfig({
  plugins: [solid({ ssr: true })],
  test: {
    environment: 'node',
    include: ['tests/**/*.ssr.test.tsx'],
  },
})
