/**
 * Fetches models from the LLM Gateway catalog and writes llmgateway.models.json.
 *
 * Usage:
 *   node scripts/fetch-llmgateway-models.ts
 *
 * modelschemas has no llmgateway provider. The catalog needs no API key.
 * JSON output cannot smuggle executable code into the build.
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, 'llmgateway.models.json')
const API_URL = 'https://api.llmgateway.io/v1/models'

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
      `Failed to fetch LLM Gateway models: ${response.status} ${response.statusText}`,
    )
  }
  const json = (await response.json()) as { data?: unknown }
  if (!Array.isArray(json.data)) {
    throw new Error('LLM Gateway /v1/models response is missing a data array')
  }
  const validModels = json.data.filter(isValidModel)
  const skipped = json.data.length - validModels.length
  if (skipped > 0) {
    console.log(`Skipped ${skipped} models missing a string id`)
  }
  validModels.sort((a, b) => a.id.localeCompare(b.id))
  await writeFile(OUTPUT_PATH, `${JSON.stringify(validModels, null, 2)}\n`)
  console.log(`Wrote ${validModels.length} models to ${OUTPUT_PATH}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
