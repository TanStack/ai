/**
 * ElevenLabs provider — pulls the public OpenAPI spec served at
 * api.elevenlabs.io/openapi.json. No auth required for the spec itself.
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

const ELEVENLABS_OPENAPI_URL = 'https://api.elevenlabs.io/openapi.json'

async function fetchElevenLabs({ outDir }: FetchOptions): Promise<void> {
  mkdirSync(outDir, { recursive: true })

  console.log(`Fetching ElevenLabs OpenAPI from ${ELEVENLABS_OPENAPI_URL}...`)
  const response = await fetch(ELEVENLABS_OPENAPI_URL)
  if (!response.ok) {
    throw new Error(
      `ElevenLabs fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const spec = (await response.json()) as object

  writeFileSync(
    join(outDir, 'elevenlabs.openapi.json'),
    JSON.stringify(spec, null, 2),
  )
  console.log('  Wrote elevenlabs.openapi.json')
}

/**
 * ElevenLabs' entire generation surface is audio, so every generation tag
 * maps to the single `audio` group (voices are included — valid voice IDs
 * and voice settings are exactly the constraint surface this package exists
 * to expose). Studio, workspace, Agents Platform, pronunciation
 * dictionaries, and the other management surfaces drop out of generation.
 */
const ELEVENLABS_AUDIO_TAGS = new Set([
  'text-to-speech',
  'text-to-dialogue',
  'speech-to-speech',
  'speech-to-text',
  'sound-generation',
  'audio-isolation',
  'text-to-voice',
  'voices',
  'forced-alignment',
  'video-to-music',
  'music',
  'dubbing',
])

function classifyElevenLabs(
  _path: string,
  post: Record<string, unknown>,
): Activity | null {
  const tags = Array.isArray(post.tags) ? (post.tags as Array<string>) : []
  return tags.some((tag) => ELEVENLABS_AUDIO_TAGS.has(tag)) ? 'audio' : null
}

function loadElevenLabs(): Array<ProviderCategorySpec> {
  const specDir = new URL('../specs/elevenlabs/', import.meta.url).pathname
  let raw: string
  try {
    raw = readFileSync(join(specDir, 'elevenlabs.openapi.json'), 'utf8')
  } catch {
    return []
  }
  const spec = JSON.parse(raw) as object
  applyTransforms(spec, { providerId: 'elevenlabs' })
  const mergedSpec: MergedSpec = mergeOpenAPISpecs([spec], 'ElevenLabs API')
  return toActivitySpecs('elevenlabs', mergedSpec, classifyElevenLabs)
}

export const elevenlabsProvider: ProviderConfig = {
  id: 'elevenlabs',
  namespace: 'ElevenLabs',
  fetch: fetchElevenLabs,
  load: loadElevenLabs,
  requiresAuth: false,
}
