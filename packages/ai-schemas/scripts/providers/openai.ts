/**
 * OpenAI provider — pulls the canonical OpenAPI spec from
 * github.com/openai/openai-openapi (raw YAML), parses it to JSON, and feeds
 * it through the shared merge/transform pipeline. Public, no auth.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  applyTransforms,
  mergeOpenAPISpecs,
  toActivitySpecs,
  type MergedSpec,
} from '../merge-openapi-specs.js'
import type {
  Activity,
  FetchOptions,
  ProviderCategorySpec,
  ProviderConfig,
} from '../providers.js'

const OPENAI_OPENAPI_URL =
  'https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml'

async function fetchOpenAI({ outDir }: FetchOptions): Promise<void> {
  mkdirSync(outDir, { recursive: true })

  console.log(`Fetching OpenAI OpenAPI from ${OPENAI_OPENAPI_URL}...`)
  const response = await fetch(OPENAI_OPENAPI_URL)
  if (!response.ok) {
    throw new Error(
      `OpenAI fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const yamlText = await response.text()

  // Inline-import YAML parser so providers that don't use it don't pay the
  // cost during pnpm install (yaml is a tiny dep but kept opt-in regardless).
  const { parse } = await import('yaml')
  const spec = parse(yamlText) as object

  writeFileSync(
    join(outDir, 'openai.openapi.json'),
    JSON.stringify(spec, null, 2),
  )
  console.log('  Wrote openai.openapi.json')
}

/**
 * Tag → activity mapping. OpenAI's spec tags every operation; tags absent
 * from this map (Assistants, Batch, Files, Fine-tuning, Vector stores, and
 * the whole organization/admin surface) are platform endpoints and drop out
 * of generation.
 */
const OPENAI_TAG_ACTIVITIES: Record<string, Activity> = {
  Chat: 'chat',
  Completions: 'chat',
  Responses: 'chat',
  Conversations: 'chat',
  Realtime: 'chat',
  Audio: 'audio',
  Images: 'image',
  Videos: 'video',
  Embeddings: 'embeddings',
  Moderations: 'moderation',
}

function classifyOpenAI(
  path: string,
  post: Record<string, unknown>,
): Activity | null {
  const tags = Array.isArray(post.tags) ? (post.tags as Array<string>) : []
  for (const tag of tags) {
    const activity = OPENAI_TAG_ACTIVITIES[tag]
    if (activity) return activity
  }
  // A handful of Responses-API operations ship untagged
  // (/responses/input_tokens, /responses/compact).
  if (path.startsWith('/responses')) return 'chat'
  return null
}

function loadOpenAI(): Array<ProviderCategorySpec> {
  const specDir = new URL('../specs/openai/', import.meta.url).pathname
  let raw: string
  try {
    raw = readFileSync(join(specDir, 'openai.openapi.json'), 'utf8')
  } catch {
    return []
  }
  const spec = JSON.parse(raw) as object
  applyTransforms(spec, { providerId: 'openai' })
  const mergedSpec: MergedSpec = mergeOpenAPISpecs([spec], 'OpenAI API')
  return toActivitySpecs('openai', mergedSpec, classifyOpenAI)
}

export const openaiProvider: ProviderConfig = {
  id: 'openai',
  namespace: 'OpenAi',
  fetch: fetchOpenAI,
  load: loadOpenAI,
  requiresAuth: false,
}
