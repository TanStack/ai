/**
 * Fetches models from the OpenRouter API and writes them to openrouter.models.ts
 *
 * Usage:
 *   pnpm tsx scripts/fetch-openrouter-models.ts
 *
 * This replaces the manual process of updating openrouter.models.ts.
 * The output file preserves the existing interface definition and exported
 * `models` array format so that convert-openrouter-models.ts continues to work.
 */

import { writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, 'openrouter.models.ts')
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
  return (
    typeof model.id === 'string' &&
    typeof model.name === 'string' &&
    typeof model.context_length === 'number' &&
    model.architecture != null &&
    model.pricing != null &&
    model.top_provider != null
  )
}

function serializeModel(model: ApiModel, isLast: boolean): string {
  const lines: Array<string> = []
  lines.push('  {')
  lines.push(`    id: '${escapeString(model.id)}',`)

  if (model.canonical_slug !== undefined) {
    lines.push(`    canonical_slug: '${escapeString(model.canonical_slug)}',`)
  }
  if (model.hugging_face_id !== undefined) {
    lines.push(
      model.hugging_face_id === null
        ? '    hugging_face_id: null,'
        : `    hugging_face_id: '${escapeString(model.hugging_face_id)}',`,
    )
  }

  lines.push(`    name: '${escapeString(model.name)}',`)

  if (model.created !== undefined) {
    lines.push(`    created: ${model.created},`)
  }
  if (model.description !== undefined) {
    lines.push(`    description: '${escapeString(model.description)}',`)
  }

  lines.push(`    context_length: ${model.context_length},`)

  // architecture
  const arch = model.architecture!
  lines.push('    architecture: {')
  lines.push(`      modality: '${escapeString(arch.modality)}',`)
  lines.push(
    `      input_modalities: [${arch.input_modalities.map((m) => `'${escapeString(m)}'`).join(', ')}],`,
  )
  lines.push(
    `      output_modalities: [${arch.output_modalities.map((m) => `'${escapeString(m)}'`).join(', ')}],`,
  )
  if (arch.tokenizer !== undefined) {
    lines.push(`      tokenizer: '${escapeString(arch.tokenizer)}',`)
  }
  if (arch.instruct_type !== undefined) {
    lines.push(
      arch.instruct_type === null
        ? '      instruct_type: null,'
        : `      instruct_type: '${escapeString(arch.instruct_type)}',`,
    )
  }
  lines.push('    },')

  // pricing
  const pricing = model.pricing!
  lines.push('    pricing: {')
  lines.push(`      prompt: '${escapeString(pricing.prompt)}',`)
  lines.push(`      completion: '${escapeString(pricing.completion)}',`)
  if (pricing.audio !== undefined) {
    lines.push(`      audio: '${escapeString(pricing.audio)}',`)
  }
  if (pricing.request !== undefined) {
    lines.push(`      request: '${escapeString(pricing.request)}',`)
  }
  if (pricing.image !== undefined) {
    lines.push(`      image: '${escapeString(pricing.image)}',`)
  }
  if (pricing.web_search !== undefined) {
    lines.push(`      web_search: '${escapeString(pricing.web_search)}',`)
  }
  if (pricing.internal_reasoning !== undefined) {
    lines.push(
      `      internal_reasoning: '${escapeString(pricing.internal_reasoning)}',`,
    )
  }
  if (pricing.input_cache_read !== undefined) {
    lines.push(
      `      input_cache_read: '${escapeString(pricing.input_cache_read)}',`,
    )
  }
  if (pricing.input_cache_write !== undefined) {
    lines.push(
      `      input_cache_write: '${escapeString(pricing.input_cache_write)}',`,
    )
  }
  lines.push('    },')

  // top_provider
  const tp = model.top_provider!
  lines.push('    top_provider: {')
  lines.push(`      context_length: ${tp.context_length},`)
  lines.push(
    `      max_completion_tokens: ${tp.max_completion_tokens === null ? 'null' : tp.max_completion_tokens},`,
  )
  lines.push(`      is_moderated: ${tp.is_moderated},`)
  lines.push('    },')

  // per_request_limits
  if (model.per_request_limits !== undefined) {
    if (model.per_request_limits === null) {
      lines.push('    per_request_limits: null,')
    } else {
      const entries = Object.entries(model.per_request_limits)
      if (entries.length === 0) {
        lines.push('    per_request_limits: {},')
      } else {
        lines.push('    per_request_limits: {')
        for (const [key, value] of entries) {
          lines.push(`      '${escapeString(key)}': '${escapeString(value)}',`)
        }
        lines.push('    },')
      }
    }
  }

  // supported_parameters
  if (model.supported_parameters !== undefined) {
    lines.push(
      `    supported_parameters: [${model.supported_parameters.map((p) => `\n      '${escapeString(p)}',`).join('')}\n    ],`,
    )
  }

  lines.push(`  }${isLast ? '' : ','}`)
  return lines.join('\n')
}

function escapeString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
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

  // Filter out models missing required fields
  const validModels = allModels.filter(isValidModel)
  const skipped = allModels.length - validModels.length
  if (skipped > 0) {
    console.log(
      `Skipped ${skipped} models missing required fields (id, name, context_length, architecture, pricing, top_provider)`,
    )
  }

  // Sort by id
  validModels.sort((a, b) => a.id.localeCompare(b.id))

  const interfaceBlock = `export interface OpenRouterModel {
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
  }

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
  }
  top_provider: {
    context_length: number
    max_completion_tokens: number | null
    is_moderated: boolean
  }
  per_request_limits?: Record<string, string> | null
  supported_parameters?: Array<string>
}`

  const modelEntries = validModels.map((model, i) =>
    serializeModel(model, i === validModels.length - 1),
  )

  const fileContent = `${interfaceBlock}

export const models: Array<OpenRouterModel> = [
${modelEntries.join('\n')}
]
`

  await writeFile(OUTPUT_PATH, fileContent, 'utf-8')
  console.log(`Fetched ${validModels.length} models`)
  console.log(`Written to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
