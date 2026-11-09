/**
 * Kubb config for the provider clients. `generate.ts` runs it with
 * `PROVIDER_CLIENTS_DOCS` (the fetched OpenAPI documents) and
 * `PROVIDER_CLIENTS_OUT` (a scratch output directory) set.
 *
 * Each provider gets `types.ts` and `sdk.ts` (one function per operation).
 * The functions import the one shared fetch runtime from
 * `@tanstack/ai-utils/kubb`, so no package carries its own copy.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'kubb/config'
import { pluginClient } from '@kubb/plugin-client'
import { pluginFetch } from '@kubb/plugin-fetch'
import { pluginTs } from '@kubb/plugin-ts'
import { PROVIDER_CLIENTS, RUNTIME_IMPORT } from './providers'

const docs = process.env.PROVIDER_CLIENTS_DOCS
const out = process.env.PROVIDER_CLIENTS_OUT
if (!docs || !out) {
  throw new Error(
    'Run this config through scripts/provider-clients/generate.ts',
  )
}

const output = (path: string) => ({
  path,
  clean: true,
  barrel: false as const,
  format: false as const,
})
// ponytail: `operations: 'inline'` prints unnamed types for the Gemini
// document (Kubb 5.16), so the operation types are exported.
const types = () =>
  pluginTs({
    output: { path: 'types.ts', barrel: false },
    operations: 'export',
  })

const available = PROVIDER_CLIENTS.filter(({ id }) =>
  existsSync(join(docs, `${id}.json`)),
)

export default defineConfig([
  ...available.map(({ id }) => ({
    input: join(docs, `${id}.json`),
    output: output(join(out, id)),
    plugins: [
      types(),
      pluginClient({
        output: { path: 'sdk.ts', barrel: false },
        importPath: RUNTIME_IMPORT,
      }),
    ],
  })),
  // `plugin-fetch` writes the `.kubb` fetch runtime that `RUNTIME_IMPORT`
  // serves. It only writes the files a document needs (`sse.ts` only for an
  // operation that is only `text/event-stream`), so it runs on every
  // document and `generate.ts` merges the runtimes. Only the runtime is kept.
  ...available.map(({ id }) => ({
    input: join(docs, `${id}.json`),
    output: output(join(out, '_runtime', id)),
    plugins: [
      types(),
      pluginFetch({ output: { path: 'sdk.ts', barrel: false } }),
    ],
  })),
])
