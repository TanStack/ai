import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import solid from 'vite-plugin-solid'
import packageJson from './package.json'

const config = defineConfig({
  // Solid components compile via vite-plugin-solid's babel transform. Under
  // vite 7 esbuild handled the JSX implicitly (jsxImportSource: solid-js);
  // vite 8's Rolldown parser rejects raw JSX ("JSX syntax is disabled"), so
  // the transform must be wired in explicitly.
  plugins: [solid()],
  test: {
    name: packageJson.name,
    dir: './',
    watch: false,
    globals: true,
    // Solid UI components pull in solid-js/web (references `document`) once
    // vite-plugin-solid transforms them into the test graph, so tests run in
    // a DOM environment rather than 'node'.
    environment: 'happy-dom',
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
