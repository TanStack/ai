import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/start.ts'],
  format: ['esm'],
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  external: ['react'],
})
