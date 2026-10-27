import { fileURLToPath } from 'node:url'
import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const config = defineConfig({
  resolve: {
    alias: [
      {
        find: /^@tanstack\/ai-persistence$/,
        replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    name: packageJson.name,
    dir: './',
    watch: false,

    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'skills-test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.config.ts',
        '**/types.ts',
      ],
      include: ['src/**/*.ts'],
    },
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    entry: ['./src/index.ts', './src/testkit/conformance.ts'],
    srcDir: './src',
    // The conformance testkit imports Vitest; keep it external so the built
    // artifact references the consumer's Vitest at test time instead of
    // bundling the runner.
    externalDeps: ['vitest'],
    cjs: false,
  }),
)
