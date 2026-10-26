/**
 * Inserts new ElevenLabs model ids into
 * `packages/ai-elevenlabs/src/model-meta.ts`.
 *
 * Reads modelschemas through `@modelschemas/client`:
 * - Text-to-speech: `listModels` for provider `elevenlabs`.
 * - Music: request schema `v1/music` (compose). That enum is the SDK
 *   `MusicModelId` set.
 * - Sound effects: `v1/sound-generation`.
 * - Voice design: `v1/text-to-voice/design`.
 *
 * Usage:
 *   pnpm tsx scripts/sync-elevenlabs-models.ts
 *
 * Optional: MODELSCHEMAS_API_KEY raises the modelschemas rate limit.
 *
 * Runs as part of `pnpm generate:models` (the daily Sync Model Metadata
 * workflow). Only adds missing ids. Transcription stays hand-maintained:
 * its speech-to-text schema has no `model_id` enum. Music and voice design
 * are pinned to SDK unions, so an id the SDK does not know yet fails the build.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  insertMissingModels,
  modelIdsFromRequestSchema,
  ttsModelIdsFromCatalog,
} from './model-sync/elevenlabs'
import type { ElevenLabsCatalogModel } from './model-sync/elevenlabs'
import {
  createSyncClient,
  getInputSchema,
  listRawModels,
} from './model-sync/modelschemas'

const __dirname = dirname(fileURLToPath(import.meta.url))
const META_FILE = resolve(
  __dirname,
  '../packages/ai-elevenlabs/src/model-meta.ts',
)

interface CatalogResponse {
  count?: number
  models?: Array<ElevenLabsCatalogModel>
}

function unwrapSchema(payload: unknown, endpointId: string): unknown {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('schema' in payload)
  ) {
    throw new Error(`modelschemas response has no schema for ${endpointId}`)
  }
  return payload.schema
}

async function main() {
  const client = createSyncClient()
  const schema = async (endpointId: string) =>
    unwrapSchema(
      await getInputSchema(client, {
        provider: 'elevenlabs',
        activity: 'audio',
        endpointId,
      }),
      endpointId,
    )
  const [catalogPayload, musicSchema, sfxSchema, voiceSchema] =
    await Promise.all([
      listRawModels(client, 'elevenlabs'),
      schema('v1/music'),
      schema('v1/sound-generation'),
      schema('v1/text-to-voice/design'),
    ])

  const body = catalogPayload as CatalogResponse
  const models = body.models
  if (!Array.isArray(models) || models.length === 0) {
    throw new Error('modelschemas returned no ElevenLabs models')
  }
  if (typeof body.count === 'number' && body.count !== models.length) {
    throw new Error(
      `modelschemas page is incomplete: count ${body.count}, got ${models.length}`,
    )
  }

  const groups: Array<[string, string, readonly string[]]> = [
    ['ELEVENLABS_TTS_MODELS', 'text-to-speech', ttsModelIdsFromCatalog(models)],
    [
      'ELEVENLABS_AUDIO_MODELS',
      'audio',
      [
        ...modelIdsFromRequestSchema(musicSchema),
        ...modelIdsFromRequestSchema(sfxSchema),
      ],
    ],
    [
      'ELEVENLABS_VOICE_MODELS',
      'voice',
      modelIdsFromRequestSchema(voiceSchema),
    ],
  ]
  if (groups.some(([, , ids]) => ids.length === 0)) {
    throw new Error('modelschemas returned an empty ElevenLabs model list')
  }

  const source = await readFile(META_FILE, 'utf8')
  let next = source
  const additions: Array<string> = []
  for (const [exportName, label, ids] of groups) {
    const added = ids.filter((id) => !source.includes(`'${id}'`))
    if (added.length > 0) additions.push(`${label}: ${added.join(', ')}`)
    next = insertMissingModels(next, exportName, ids)
  }
  if (next === source) {
    console.log('ElevenLabs models already match modelschemas')
    return
  }

  await writeFile(META_FILE, next)
  console.log(`Added ElevenLabs models (${additions.join('; ')})`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
