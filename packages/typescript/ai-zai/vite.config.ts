import { defineConfig, mergeConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

const mode = process.env.NODE_ENV ?? 'test'
const env = loadEnv(mode, process.cwd(), '')
for (const [key, value] of Object.entries(env)) {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value
  }
}

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
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
