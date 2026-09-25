/**
 * Fetches models from the Vercel AI Gateway API and writes them to
 * vercel-gateway.models.json.
 *
 * Usage:
 *   pnpm tsx scripts/fetch-vercel-gateway-models.ts
 *
 * The output is plain JSON so a malicious or compromised upstream response
 * cannot smuggle executable code into the build (JSON.stringify cannot produce
 * a JS expression). The committed wrapper at `vercel-gateway.models.ts`
 * re-exports this JSON typed as `Array<VercelGatewayCatalogModel>`.
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, 'vercel-gateway.models.json')
const API_URL = 'https://ai-gateway.vercel.sh/v1/models'

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

  const apiKey = process.env.AI_GATEWAY_API_KEY
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const response = await fetch(API_URL, {
    headers,
    signal: AbortSignal.timeout(30_000),
  })

  if (response.status === 401 && !apiKey) {
    throw new Error(
      'GET https://ai-gateway.vercel.sh/v1/models returned 401. Set AI_GATEWAY_API_KEY in the environment (CI must set secrets.AI_GATEWAY_API_KEY).',
    )
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Vercel AI Gateway models: ${response.status} ${response.statusText}`,
    )
  }

  const json = (await response.json()) as { data?: unknown }
  if (!Array.isArray(json.data)) {
    throw new Error(
      'Vercel AI Gateway /v1/models response is missing a data array',
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
