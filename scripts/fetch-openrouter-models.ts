/**
 * Fetches models from the OpenRouter API and writes them to openrouter.models.json.
 *
 * Usage:
 *   pnpm tsx scripts/fetch-openrouter-models.ts
 *
 * The output is plain JSON so a malicious or compromised upstream response
 * cannot smuggle executable code into the build (JSON.stringify cannot produce
 * a JS expression). The committed wrapper at `openrouter.models.ts` re-exports
 * this JSON typed as `Array<OpenRouterModel>` so consumers don't need to know
 * where the data lives.
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, 'openrouter.models.json')
const API_URL = 'https://openrouter.ai/api/v1/models'

interface ApiModel {
  id: string
  canonical_slug?: string
  hugging_face_id?: string | null
  name: string
  created?: number
  description?: string
  context_length: number
  architecture: {
    modality: string
    input_modalities: Array<string>
    output_modalities: Array<string>
    tokenizer?: string
    instruct_type?: string | null
  } | null
  pricing: {
    prompt: string
    completion: string
    audio?: string
    request?: string
    image?: string
    web_search?: string
    internal_reasoning?: string
    input_cache_read?: string
    input_cache_write?: string
  } | null
  top_provider: {
    context_length: number
    max_completion_tokens: number | null
    is_moderated: boolean
  } | null
  per_request_limits?: Record<string, string> | null
  supported_parameters?: Array<string>
}

function isValidModel(model: ApiModel): boolean {
  if (
    typeof model.id !== 'string' ||
    typeof model.name !== 'string' ||
    typeof model.context_length !== 'number' ||
    model.architecture == null ||
    model.pricing == null ||
    model.top_provider == null
  ) {
    return false
  }
  if (model.created !== undefined && !Number.isFinite(model.created)) {
    return false
  }
  const tp = model.top_provider
  if (!Number.isFinite(tp.context_length)) return false
  if (
    tp.max_completion_tokens !== null &&
    !Number.isFinite(tp.max_completion_tokens)
  ) {
    return false
  }
  if (typeof tp.is_moderated !== 'boolean') return false
  return true
}

async function main() {
  console.log(`Fetching models from ${API_URL}...`)
  const response = await fetch(API_URL, {
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models: ${response.status} ${response.statusText}`,
    )
  }

  const json = (await response.json()) as { data: Array<ApiModel> }
  const allModels = json.data

  const validModels = allModels.filter(isValidModel)
  const skipped = allModels.length - validModels.length
  if (skipped > 0) {
    console.log(
      `Skipped ${skipped} models missing required fields (id, name, context_length, architecture, pricing, top_provider)`,
    )
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
