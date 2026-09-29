/**
 * Inserts new ElevenLabs text-to-speech model ids into
 * `packages/ai-elevenlabs/src/model-meta.ts`.
 *
 * Source: https://modelschemas.com/v1/models?provider=elevenlabs
 *
 * Usage:
 *   pnpm tsx scripts/sync-elevenlabs-models.ts
 *
 * Runs as part of `pnpm generate:models` (the daily Sync Model Metadata
 * workflow). Only adds missing `canDoTextToSpeech` ids. Music, sound
 * effects, transcription, and voice design stay hand-maintained: modelschemas
 * does not list them, and music / voice design are pinned to SDK unions.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  insertMissingTtsModels,
  ttsModelIdsFromCatalog,
} from './model-sync/elevenlabs'
import type { ElevenLabsCatalogModel } from './model-sync/elevenlabs'

const CATALOG_URL = 'https://modelschemas.com/v1/models?provider=elevenlabs'
const __dirname = dirname(fileURLToPath(import.meta.url))
const META_FILE = resolve(
  __dirname,
  '../packages/ai-elevenlabs/src/model-meta.ts',
)

interface CatalogResponse {
  count?: number
  models?: Array<ElevenLabsCatalogModel>
}

async function main() {
  const response = await fetch(CATALOG_URL)
  if (!response.ok) {
    throw new Error(
      `modelschemas ${response.status} ${response.statusText} for ${CATALOG_URL}`,
    )
  }
  const body = (await response.json()) as CatalogResponse
  const models = body.models
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('modelschemas returned no ElevenLabs models')
  }
  if (typeof body.count === 'number' && body.count !== models.length) {
    throw new Error(
      `modelschemas page is incomplete: count ${body.count}, got ${models.length}`,
    )
  }

  const ids = ttsModelIdsFromCatalog(models)
  if (ids.length === 0) {
    throw new Error('modelschemas returned no ElevenLabs text-to-speech models')
  }

  const source = await readFile(META_FILE, 'utf8')
  const next = insertMissingTtsModels(source, ids)
  if (next === source) {
    console.log('ElevenLabs text-to-speech models already match modelschemas')
    return
  }

  await writeFile(META_FILE, next)
  const added = ids.filter((id) => !source.includes(`'${id}'`))
  console.log(`Added ElevenLabs text-to-speech models: ${added.join(', ')}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
