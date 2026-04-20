/**
 * Local dev server using miniflare directly.
 *
 * wrangler dev does NOT translate [[unsafe.bindings]] type = "unsafe_eval"
 * into miniflare's unsafeEvalBinding option, so the binding is always
 * undefined in local dev. This script bundles the Worker with esbuild
 * and runs it via miniflare with unsafeEvalBinding configured correctly.
 *
 * Usage: node dev-server.mjs [--port 8787]
 */

import { Miniflare } from 'miniflare'
import { build } from 'esbuild'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENTRY = resolve(__dirname, 'src/worker/index.ts')
const PORT = Number(process.env.PORT) || 8787

const result = await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'esm',
  target: 'esnext',
  write: false,
})

const mf = new Miniflare({
  modules: [
    {
      type: 'ESModule',
      path: 'worker.js',
      contents: result.outputFiles[0].text,
    },
  ],
  unsafeEvalBinding: 'UNSAFE_EVAL',
  compatibilityDate: '2024-12-01',
  compatibilityFlags: ['nodejs_compat'],
  port: PORT,
})

const url = await mf.ready
console.log(`Worker ready on ${url}`)

process.on('SIGINT', async () => {
  await mf.dispose()
  process.exit(0)
})
