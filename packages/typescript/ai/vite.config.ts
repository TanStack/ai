import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import packageJson from './package.json'

const config = defineConfig({
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
  mergeConfig(
    config,
    tanstackViteConfig({
      entry: ['./src/index.ts', './src/event-client.ts'],
      srcDir: './src',
    }),
  ),
  defineConfig({
    build: {
      rollupOptions: {
        external: (id) => {
          // Mark @alcyone-labs/zod-to-json-schema as external
          if (
            id === '@alcyone-labs/zod-to-json-schema' ||
            id.startsWith('@alcyone-labs/zod-to-json-schema/')
          ) {
            return true
          }
          return false
        },
      },
    },
  }),
)
