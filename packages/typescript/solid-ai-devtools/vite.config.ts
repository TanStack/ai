import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import packageJson from './package.json'
import solid from 'vite-plugin-solid'

const config = defineConfig({
  plugins: [solid()],
  test: {
    name: packageJson.name,
    dir: './',
    watch: false,
    globals: true,
    environment: 'node',
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
    entry: ['./src/index.ts', './src/production.ts'],
    srcDir: './src',
    cjs: false,
  }),
)
