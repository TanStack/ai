import { defineConfig } from 'tsup'

/**
 * The `ts-ai` executable. Our own source is bundled into a single `bin.js`;
 * every package.json dependency (Ink, React, the MCP SDK, and all provider
 * adapters) stays external and is resolved from node_modules at runtime. The
 * provider packages are loaded via dynamic `import()` on demand, so they are
 * intentionally kept external here too.
 */
export default defineConfig({
  entry: { bin: 'src/cli/bin.ts' },
  outDir: 'dist/bin',
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  // tsup externalizes package.json deps by default; nothing extra to inline.
  banner: { js: '#!/usr/bin/env node' },
})
