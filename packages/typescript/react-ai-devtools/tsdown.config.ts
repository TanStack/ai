import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/production.ts'],
  format: ['esm'],
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
})
