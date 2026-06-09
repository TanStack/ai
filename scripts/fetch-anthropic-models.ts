/**
 * Fetches the model catalog from Anthropic's first-party Models API
 * (GET /v1/models) and writes it to scripts/anthropic.models.json.
 *
 * Unlike the OpenRouter catalog, this is the authoritative source for
 * Anthropic model IDs, context windows, max output tokens, and per-model
 * capabilities (adaptive vs extended thinking, image input, etc.).
 * Pricing is NOT exposed by the Models API — see the PRICING table in
 * sync-anthropic-models.ts.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... pnpm generate:anthropic-models:fetch
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, 'anthropic.models.json')
const API_URL = 'https://api.anthropic.com/v1/models'
const PAGE_LIMIT = 100

interface ModelsPage {
  data: Array<{ id: string }>
  has_more: boolean
  last_id: string | null
}

async function fetchPage(
  apiKey: string,
  afterId: string | undefined,
): Promise<ModelsPage> {
  const url = new URL(API_URL)
  url.searchParams.set('limit', String(PAGE_LIMIT))
  if (afterId) {
    url.searchParams.set('after_id', afterId)
  }
  const response = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  })
  if (!response.ok) {
    throw new Error(
      `Anthropic Models API request failed: ${response.status} ${await response.text()}`,
    )
  }
  return (await response.json()) as ModelsPage
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error(
      'ANTHROPIC_API_KEY must be set to fetch the Anthropic model catalog.',
    )
    process.exit(1)
  }

  const models: Array<{ id: string }> = []
  let afterId: string | undefined
  for (;;) {
    const page = await fetchPage(apiKey, afterId)
    models.push(...page.data)
    if (!page.has_more || !page.last_id) break
    afterId = page.last_id
  }

  models.sort((a, b) => a.id.localeCompare(b.id))
  await writeFile(
    OUTPUT_PATH,
    JSON.stringify({ data: models }, null, 2) + '\n',
    'utf-8',
  )
  console.log(`Wrote ${models.length} models to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
