/**
 * Fetches the models.dev catalog and writes the part `@tanstack/ai-models`
 * and the reasoning sync read to `models-dev.models.json`: the providers in
 * `packages/ai-models/scripts/providers.ts` and
 * `scripts/model-sync/reasoning-targets.ts`, the models the borrow list
 * takes, and only the fields the generators use.
 *
 * Usage:
 *   pnpm tsx scripts/fetch-models-dev.ts
 *
 * The output is plain JSON, so an upstream response cannot put code in the
 * build.
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROVIDERS } from '../packages/ai-models/scripts/providers'
import { BORROW } from '../packages/ai-models/scripts/known-ids'
import { REASONING_SOURCES } from './model-sync/reasoning-targets'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, 'models-dev.models.json')
const API_URL = 'https://models.dev/api.json'

interface ApiModel {
  id: string
  name?: string
  reasoning?: boolean
  reasoning_options?: Array<unknown>
  interleaved?: unknown
  temperature?: boolean
  modalities?: { input?: Array<string>; output?: Array<string> }
  cost?: {
    input?: number
    output?: number
    cache_read?: number
    cache_write?: number
  }
  limit?: { context?: number; output?: number }
  provider?: { npm?: string; api?: string }
  canonical_model_id?: string
  status?: string
}

interface ApiProvider {
  id: string
  name?: string
  env?: Array<string>
  npm?: string
  api?: string
  models?: Record<string, ApiModel>
}

const trimModel = (model: ApiModel) => ({
  id: model.id,
  name: model.name,
  reasoning: model.reasoning,
  reasoning_options: model.reasoning_options,
  interleaved: model.interleaved,
  temperature: model.temperature,
  modalities: model.modalities,
  cost: model.cost && {
    input: model.cost.input,
    output: model.cost.output,
    cache_read: model.cost.cache_read,
    cache_write: model.cost.cache_write,
  },
  limit: model.limit && {
    context: model.limit.context,
    output: model.limit.output,
  },
  provider: model.provider && {
    npm: model.provider.npm,
    api: model.provider.api,
  },
  canonical_model_id: model.canonical_model_id,
  status: model.status,
})

async function main() {
  const response = await fetch(API_URL)
  if (!response.ok)
    throw new Error(
      `models.dev answered ${response.status} ${response.statusText}`,
    )
  const catalog = (await response.json()) as Record<string, ApiProvider>

  // Every model of a catalog provider. From the other providers, only the
  // models the borrow list takes. It names `provider/model`, and model ids
  // can hold `/` too, so the provider is the part before the first one.
  // The reasoning sync (`sync-model-reasoning.ts`) reads the provider
  // packages' own models.dev lists too.
  const whole = new Set([
    ...PROVIDERS.flatMap((row) => row.sources),
    ...REASONING_SOURCES,
  ])
  const borrowed = new Map<string, Set<string>>()
  for (const entries of Object.values(BORROW))
    for (const source of Object.values(entries)) {
      const slash = source.indexOf('/')
      const provider = source.slice(0, slash)
      if (whole.has(provider)) continue
      borrowed.set(
        provider,
        (borrowed.get(provider) ?? new Set()).add(source.slice(slash + 1)),
      )
    }

  const trimmed: Record<string, unknown> = {}
  for (const id of [...whole, ...borrowed.keys()].sort()) {
    const provider = catalog[id]
    if (!provider) {
      console.warn(`  Warning: models.dev has no provider '${id}'`)
      continue
    }
    const keep = borrowed.get(id)
    trimmed[id] = {
      id: provider.id,
      name: provider.name,
      env: provider.env,
      npm: provider.npm,
      api: provider.api,
      models: Object.fromEntries(
        Object.entries(provider.models ?? {})
          .filter(([key]) => !keep || keep.has(key))
          .map(([key, model]) => [key, trimModel(model)]),
      ),
    }
  }
  await writeFile(OUTPUT_PATH, `${JSON.stringify(trimmed, null, 2)}\n`)
  console.log(
    `Wrote ${Object.keys(trimmed).length} providers to ${OUTPUT_PATH}`,
  )
}

await main()
