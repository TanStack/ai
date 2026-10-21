/**
 * Fetches the Neon AI Gateway model catalog and writes it to
 * neon.models.json.
 *
 * Usage:
 *   pnpm tsx scripts/fetch-neon-models.ts
 *
 * The catalog is public. `https://neon.com/models` serves it as JSON when the
 * request asks for JSON. That shape carries `capabilities` (which endpoint
 * serves each model); `neon.com/models.json` (the models.dev shape) does not.
 *
 * The output is plain JSON so a malicious or compromised upstream response
 * cannot smuggle executable code into the build. The committed wrapper at
 * `neon.models.ts` re-exports this JSON typed as `Array<NeonCatalogModel>`.
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, 'neon.models.json')
const API_URL = 'https://neon.com/models'
const SCHEMA = 'https://neon.com/schemas/ai-gateway-models.json'

interface ApiModel {
  id: string
  [key: string]: unknown
}

function isValidModel(model: unknown): model is ApiModel {
  return (
    typeof model === 'object' &&
    model !== null &&
    typeof (model as { id?: unknown }).id === 'string' &&
    (model as { id: string }).id.length > 0
  )
}

async function main() {
  console.log(`Fetching models from ${API_URL}...`)

  const response = await fetch(API_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(
      `Failed to fetch the Neon AI Gateway catalog: ${response.status} ${response.statusText}`,
    )
  }

  const json = (await response.json()) as {
    $schema?: unknown
    models?: unknown
  }
  if (json.$schema !== SCHEMA) {
    throw new Error(
      `The Neon catalog has $schema ${JSON.stringify(json.$schema)}, expected ${SCHEMA}`,
    )
  }
  if (!Array.isArray(json.models)) {
    throw new Error('The Neon catalog is missing a models array')
  }

  const validModels = json.models.filter(isValidModel)
  const skipped = json.models.length - validModels.length
  if (skipped > 0) {
    console.log(`Skipped ${skipped} models missing a string id`)
  }

  // ponytail: `examples` is copy-paste code for the website, not model data.
  const rows = validModels
    .map(({ examples: _examples, ...model }) => model)
    .sort((a, b) => a.id.localeCompare(b.id))

  await writeFile(OUTPUT_PATH, JSON.stringify(rows, null, 2) + '\n', 'utf-8')
  console.log(`Fetched ${rows.length} models`)
  console.log(`Written to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
