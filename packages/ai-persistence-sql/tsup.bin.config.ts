import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { bin: 'src/bin.ts' },
  outDir: 'dist/bin',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: false,
  banner: { js: '#!/usr/bin/env node' },
})
