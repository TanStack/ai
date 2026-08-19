/**
 * Fetches models from the OpenRouter API and writes them to openrouter.models.json
 * and openrouter.video-models.json.
 *
 * Usage:
 *   pnpm tsx scripts/fetch-openrouter-models.ts
 *
 * Video generation models do NOT appear in the plain `GET /api/v1/models`
 * listing — they live behind the dedicated `GET /api/v1/videos/models`
 * endpoint, so this script fetches both and writes each to its own JSON file.
 *
 * The output is plain JSON so a malicious or compromised upstream response
 * cannot smuggle executable code into the build (JSON.stringify cannot produce
 * a JS expression). The committed wrappers at `openrouter.models.ts` /
 * `openrouter.video-models.ts` re-export the JSON typed as
 * `Array<OpenRouterModel>` / `Array<OpenRouterVideoApiModel>` so consumers
 * don't need to know where the data lives.
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, 'openrouter.models.json')
const VIDEO_OUTPUT_PATH = resolve(__dirname, 'openrouter.video-models.json')
const API_URL = 'https://openrouter.ai/api/v1/models'
const VIDEO_API_URL = 'https://openrouter.ai/api/v1/videos/models'

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

interface VideoApiModel {
  id: string
  name: string
  supported_durations: Array<number> | null
  supported_resolutions: Array<string> | null
  supported_aspect_ratios: Array<string> | null
  supported_frame_images: Array<string> | null
  supported_sizes: Array<string> | null
  generate_audio: boolean | null
  seed: boolean | null
  pricing_skus?: Record<string, string> | null
  allowed_passthrough_parameters?: Array<string>
}

function isValidVideoModel(model: VideoApiModel): boolean {
  if (typeof model.id !== 'string' || typeof model.name !== 'string') {
    return false
  }
  const arrayOrNull = (v: unknown) => v === null || Array.isArray(v)
  return (
    arrayOrNull(model.supported_durations) &&
    arrayOrNull(model.supported_resolutions) &&
    arrayOrNull(model.supported_aspect_ratios) &&
    arrayOrNull(model.supported_frame_images) &&
    arrayOrNull(model.supported_sizes)
  )
}

async function fetchJson<T>(url: string): Promise<T> {
  console.log(`Fetching models from ${url}...`)
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch models: ${response.status} ${response.statusText}`,
    )
  }

  return (await response.json()) as T
}

async function main() {
  const json = await fetchJson<{ data: Array<ApiModel> }>(API_URL)
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

  const videoJson = await fetchJson<{ data: Array<VideoApiModel> }>(
    VIDEO_API_URL,
  )
  const validVideoModels = videoJson.data.filter(isValidVideoModel)
  const skippedVideo = videoJson.data.length - validVideoModels.length
  if (skippedVideo > 0) {
    console.log(
      `Skipped ${skippedVideo} video models with malformed fields (id, name, supported_* arrays)`,
    )
  }

  validVideoModels.sort((a, b) => a.id.localeCompare(b.id))

  await writeFile(
    VIDEO_OUTPUT_PATH,
    JSON.stringify(validVideoModels, null, 2) + '\n',
    'utf-8',
  )
  console.log(`Fetched ${validVideoModels.length} video models`)
  console.log(`Written to ${VIDEO_OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
