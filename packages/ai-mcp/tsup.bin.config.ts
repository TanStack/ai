import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { bin: 'src/cli/bin.ts' },
  outDir: 'dist/bin',
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  // Inline codegen-only deps into the bin so they aren't runtime deps of the lib.
  noExternal: ['json-schema-to-typescript', 'jiti'],
  // Keep the heavy SDK + workspace pkg external (installed alongside).
  external: ['@modelcontextprotocol/sdk', '@tanstack/ai'],
  banner: { js: '#!/usr/bin/env node' },
})
