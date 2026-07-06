import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { bin: 'src/bin.ts' },
  outDir: 'dist/bin',
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  external: ['@tanstack/ai-persistence-sql'],
  banner: { js: '#!/usr/bin/env node' },
})
