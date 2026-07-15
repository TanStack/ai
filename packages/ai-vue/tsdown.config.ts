import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/transaction.ts'],
  format: ['esm'],
  unbundle: true,
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  fixedExtension: false,
  publint: {
    strict: true,
  },
})
