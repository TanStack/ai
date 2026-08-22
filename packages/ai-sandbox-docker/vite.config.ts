import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './',
    watch: false,

    globals: true,
    environment: 'node',
    // makeGitRepo + sbx create under Nx parallel load exceeds vitest's 5s default.
    testTimeout: 30_000,
    include: ['tests/**/*.test.ts'],
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
    entry: ['./src/index.ts'],
    srcDir: './src',
    cjs: false,
  }),
)
