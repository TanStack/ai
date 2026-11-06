import { defineConfig } from 'vitest/config'
import packageJson from './package.json'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'remix/component',
  },
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'remix/component',
    },
  },
  test: {
    name: packageJson.name,
    dir: './',
    watch: false,
    globals: false,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**'],
    },
  },
})
