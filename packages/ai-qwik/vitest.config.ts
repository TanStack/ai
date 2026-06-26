import { defineConfig } from 'vitest/config'
import { qwikVite } from '@qwik.dev/core/optimizer'
import packageJson from './package.json'

export default defineConfig({
  plugins: [qwikVite()],
  test: {
    name: packageJson.name,
    dir: './',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.config.ts',
      ],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
})
