/**
 * Anthropic provider — pulls the official OpenAPI spec published by
 * Anthropic's Stainless-generated SDKs. The `.stats.yml` file in
 * anthropic-sdk-typescript declares the current `openapi_spec_url`, which
 * points at a hash-stamped YAML in Google Cloud Storage that updates whenever
 * Anthropic ships a new API revision.
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

const ANTHROPIC_STATS_URL =
  'https://raw.githubusercontent.com/anthropics/anthropic-sdk-typescript/main/.stats.yml'

async function resolveSpecUrl(): Promise<string> {
  const response = await fetch(ANTHROPIC_STATS_URL)
  if (!response.ok) {
    throw new Error(
      `Anthropic .stats.yml fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const text = await response.text()
  // .stats.yml is plain YAML key-value; we only need one field, so avoid
  // pulling in a YAML parser for the common case.
  const match = text.match(/^openapi_spec_url:\s*(.+)$/m)
  if (!match) {
    throw new Error(
      "Anthropic .stats.yml: couldn't find openapi_spec_url field",
    )
  }
  return match[1]!.trim()
}

async function fetchAnthropic({ outDir }: FetchOptions): Promise<void> {
  mkdirSync(outDir, { recursive: true })

  const specUrl = await resolveSpecUrl()
  console.log(`Fetching Anthropic OpenAPI from ${specUrl}...`)
  const response = await fetch(specUrl)
  if (!response.ok) {
    throw new Error(
      `Anthropic OpenAPI fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const yamlText = await response.text()
  const { parse } = await import('yaml')
  const spec = parse(yamlText) as object
  writeFileSync(
    join(outDir, 'anthropic.openapi.json'),
    JSON.stringify(spec, null, 2),
  )
  console.log('  Wrote anthropic.openapi.json')
}

/**
 * Anthropic's generation surface is messages + the legacy text completion
 * (plus their `?beta=true` variants and token counting). Batches, files,
 * skills, and the agent-platform surfaces (environments, sessions, vaults,
 * memory stores, …) are platform endpoints and drop out of generation.
 */
function classifyAnthropic(path: string): Activity | null {
  const bare = path.replace(/\?beta=true$/, '')
  if (bare.startsWith('/v1/messages/batches')) return null
  if (bare === '/v1/messages' || bare === '/v1/messages/count_tokens') {
    return 'chat'
  }
  if (bare === '/v1/complete') return 'chat'
  return null
}

function loadAnthropic(): Array<ProviderCategorySpec> {
  const specDir = new URL('../specs/anthropic/', import.meta.url).pathname
  let raw: string
  try {
    raw = readFileSync(join(specDir, 'anthropic.openapi.json'), 'utf8')
  } catch {
    return []
  }
  const spec = JSON.parse(raw) as object
  applyTransforms(spec, { providerId: 'anthropic' })
  const mergedSpec: MergedSpec = mergeOpenAPISpecs([spec], 'Anthropic API')
  return toActivitySpecs('anthropic', mergedSpec, classifyAnthropic)
}

export const anthropicProvider: ProviderConfig = {
  id: 'anthropic',
  namespace: 'Anthropic',
  fetch: fetchAnthropic,
  load: loadAnthropic,
  requiresAuth: false,
}
