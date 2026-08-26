import { defineConfig, mergeConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const config = defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        runes: true,
      },
    }),
  ],
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
      exclude: ['node_modules/', 'dist/', 'tests/'],
      include: ['src/**/*.ts', 'src/**/*.svelte'],
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
