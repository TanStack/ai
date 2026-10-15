/**
 * Fetches the modelschemas catalog in one call. Writes the fields the
 * generator reads, for the providers in `packages/ai-models/scripts/providers.ts`,
 * to `modelschemas.models.json`: chat rows only, one row per line, so a daily
 * refresh has a small diff. Deprecated rows are left out.
 *
 * Usage:
 *   pnpm tsx scripts/fetch-modelschemas.ts
 *
 * The output is plain JSON, so an upstream response cannot put code in the
 * build.
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROVIDERS } from '../packages/ai-models/scripts/providers'
import { makesText } from '../packages/ai-models/scripts/rules'
import type { SchemaModel } from '../packages/ai-models/scripts/rules'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, 'modelschemas.models.json')
const API_URL = 'https://modelschemas.com/v1/models'

type ApiModel = SchemaModel & {
  provider: string
  deprecatedAt?: number | null
}

const trimModel = (model: ApiModel): SchemaModel => ({
  rawId: model.rawId,
  displayName: model.displayName,
  activity: model.activity,
  schemaEndpointId: model.schemaEndpointId,
  contextWindow: model.contextWindow,
  maxOutput: model.maxOutput,
  modalities: model.modalities,
  capabilities: model.capabilities && {
    reasoning: model.capabilities.reasoning,
    temperature: model.capabilities.temperature,
  },
  reasoning: model.reasoning,
  requestMap: model.requestMap && {
    thinking: model.requestMap.thinking && {
      levels: model.requestMap.thinking.levels,
    },
    maxTokensField: model.requestMap.maxTokensField,
    developerRole: model.requestMap.developerRole,
    replayReasoningContent: model.requestMap.replayReasoningContent,
    reasoningEffort: model.requestMap.reasoningEffort,
  },
  aliases: model.aliases,
  pricing: model.pricing && {
    tables: model.pricing.tables,
    price: model.pricing.price,
  },
})

async function main() {
  // One call: modelschemas allows 60 anonymous calls an hour.
  const url = `${API_URL}?pricing=1`
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(
      `modelschemas answered ${response.status} ${response.statusText} for ${url}`,
    )
  const body = (await response.json()) as {
    count: number
    models: Array<ApiModel>
  }
  if (body.models.length !== body.count)
    throw new Error(
      `modelschemas page is incomplete: count ${body.count}, got ${body.models.length}`,
    )

  const ids = [...new Set(PROVIDERS.flatMap((row) => row.sources))].sort()
  const providers = ids.map((id) => {
    const models = body.models
      .filter(
        (model) =>
          model.provider === id && !model.deprecatedAt && makesText(model),
      )
      .map(trimModel)
      .sort((a, b) => a.rawId.localeCompare(b.rawId))
    if (models.length === 0)
      throw new Error(`modelschemas has no chat models for provider '${id}'`)
    return `  ${JSON.stringify(id)}: [\n${models.map((model) => `    ${JSON.stringify(model)}`).join(',\n')}\n  ]`
  })
  await writeFile(OUTPUT_PATH, `{\n${providers.join(',\n')}\n}\n`)
  console.log(`Wrote ${ids.length} providers to ${OUTPUT_PATH}`)
}

await main()
