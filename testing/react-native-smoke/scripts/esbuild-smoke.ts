import { rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '../../..')
const outdir = resolve(scriptDir, '../.esbuild-smoke-dist')

rmSync(outdir, { force: true, recursive: true })

await build({
  absWorkingDir: resolve(scriptDir, '..'),
  alias: {
    '@tanstack/ai': resolve(repoRoot, 'packages/ai/src/index.ts'),
    '@tanstack/ai/client': resolve(repoRoot, 'packages/ai/src/client.ts'),
    '@tanstack/ai-client': resolve(repoRoot, 'packages/ai-client/src/index.ts'),
    '@tanstack/ai-event-client': resolve(
      repoRoot,
      'packages/ai-event-client/src/index.ts',
    ),
    '@tanstack/ai-react': resolve(repoRoot, 'packages/ai-react/src/index.ts'),
    'react-native': resolve(scriptDir, 'react-native-runtime-stub.tsx'),
  },
  bundle: true,
  define: {
    'process.env.EXPO_PUBLIC_TANSTACK_AI_CHAT_URL': 'undefined',
  },
  entryPoints: ['src/App.tsx'],
  external: ['react'],
  format: 'esm',
  logLevel: 'info',
  outfile: resolve(outdir, 'app.js'),
  platform: 'browser',
})
