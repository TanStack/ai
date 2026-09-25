/**
 * Fetches models from the Lovable AI Gateway API and writes them to
 * lovable-gateway.models.json.
 *
 * Usage:
 *   pnpm tsx scripts/fetch-lovable-gateway-models.ts
 *
 * The endpoint is public — no API key required.
 *
 * The output is plain JSON so a malicious or compromised upstream response
 * cannot smuggle executable code into the build (JSON.stringify cannot produce
 * a JS expression). The committed wrapper at `lovable-gateway.models.ts`
 * re-exports this JSON typed as `Array<LovableGatewayCatalogModel>`.
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, 'lovable-gateway.models.json')
const API_URL = 'https://ai.gateway.lovable.dev/v1/models'

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
      `Failed to fetch Lovable AI Gateway models: ${response.status} ${response.statusText}`,
    )
  }

  const json = (await response.json()) as { data?: unknown }
  if (!Array.isArray(json.data)) {
    throw new Error(
      'Lovable AI Gateway /v1/models response is missing a data array',
    )
  }

  const allModels = json.data
  const validModels = allModels.filter(isValidModel)
  const skipped = allModels.length - validModels.length
  if (skipped > 0) {
    console.log(`Skipped ${skipped} models missing a string id`)
  }

  validModels.sort((a, b) => a.id.localeCompare(b.id))

  await writeFile(
    OUTPUT_PATH,
    JSON.stringify(validModels, null, 2) + '\n',
    'utf-8',
  )
  console.log(`Fetched ${validModels.length} models`)
  console.log(`Written to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
