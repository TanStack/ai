// xAI Grok provider — pulls the first-party OpenAPI 3.1 spec served at
// docs.x.ai/openapi.json. Public, no auth required for the spec itself.
//
// We use the provider id `grok` to match the existing `@tanstack/ai-grok`
// adapter package, even though xAI's spec is titled "xAI's REST API".

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

const GROK_OPENAPI_URL = 'https://docs.x.ai/openapi.json'

async function fetchGrok({ outDir }: FetchOptions): Promise<void> {
  mkdirSync(outDir, { recursive: true })

  console.log(`Fetching xAI Grok OpenAPI from ${GROK_OPENAPI_URL}...`)
  const response = await fetch(GROK_OPENAPI_URL)
  if (!response.ok) {
    throw new Error(
      `Grok fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const spec = (await response.json()) as object
  writeFileSync(
    join(outDir, 'grok.openapi.json'),
    JSON.stringify(spec, null, 2),
  )
  console.log('  Wrote grok.openapi.json')
}

/**
 * xAI tags every operation `v1`, so classify by path. The text-generation
 * surface spans the OpenAI-compatible endpoints (chat/completions,
 * completions, responses) and the Anthropic-compatible ones (messages,
 * complete). Files and document search are platform endpoints.
 */
function classifyGrok(path: string): Activity | null {
  if (
    path === '/v1/chat/completions' ||
    path === '/v1/completions' ||
    path === '/v1/complete' ||
    path === '/v1/messages' ||
    path === '/v1/responses' ||
    path === '/v1/tokenize-text'
  ) {
    return 'chat'
  }
  if (path.startsWith('/v1/images/')) return 'image'
  if (path.startsWith('/v1/videos/')) return 'video'
  if (path === '/v1/embeddings') return 'embeddings'
  return null
}

function loadGrok(): Array<ProviderCategorySpec> {
  const specDir = new URL('../specs/grok/', import.meta.url).pathname
  let raw: string
  try {
    raw = readFileSync(join(specDir, 'grok.openapi.json'), 'utf8')
  } catch {
    return []
  }
  const spec = JSON.parse(raw) as object
  applyTransforms(spec, { providerId: 'grok' })
  const mergedSpec: MergedSpec = mergeOpenAPISpecs([spec], 'xAI Grok API')
  return toActivitySpecs('grok', mergedSpec, classifyGrok)
}

export const grokProvider: ProviderConfig = {
  id: 'grok',
  namespace: 'Grok',
  fetch: fetchGrok,
  load: loadGrok,
  requiresAuth: false,
}
