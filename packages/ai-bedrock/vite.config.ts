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
    entry: ['./src/index.ts', './src/sigv4/index.ts'],
    srcDir: './src',
    cjs: false,
    // `aws-sigv4-fetch` is an optional, user-installed dependency that the
    // `/sigv4` subpath dynamically imports. It is intentionally NOT declared in
    // package.json (pnpm v11 autoInstallPeers + trust-policy interaction), so
    // externalizeDeps (which reads the manifest) does not pick it up. Externalize
    // it explicitly so Rollup leaves the dynamic import in place instead of
    // trying — and failing — to bundle it.
    externalDeps: ['aws-sigv4-fetch'],
  }),
)
