/**
 * Converts Neon AI Gateway catalog rows into packages/ai-neon/src/model-meta.ts.
 *
 * Usage:
 *   pnpm tsx scripts/convert-neon-models.ts
 */

import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ANTHROPIC_MODELS } from '../packages/ai-anthropic/src/model-meta'
import { models } from './neon.models'
import {
  reasoningShapeName,
  reasoningShapeTable,
} from './model-sync/reasoning-shapes'
import type { NeonCatalogModel } from './neon.models'
import type { ReasoningLevel, ReasoningLevels } from '@tanstack/ai'
import type { ReasoningShape } from './model-sync/reasoning-shapes'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(__dirname, '../packages/ai-neon/src/model-meta.ts')

type InputModality = 'text' | 'image' | 'audio' | 'video' | 'document'

const INPUT_MODALITY_ORDER: Array<InputModality> = [
  'text',
  'image',
  'document',
  'audio',
  'video',
]

const MODALITY_MAP: Record<string, InputModality> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  pdf: 'document',
  file: 'document',
  document: 'document',
}

// The effort values that are TanStack levels of the same name. `none` is `off`.
const LEVELS = new Set<string>([
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])

function formatStringArray(ids: Array<string>): string {
  if (ids.length === 0) return '[] as const'
  return `[\n${ids.map((id) => `  ${JSON.stringify(id)},`).join('\n')}\n] as const`
}

function inputModalitiesFor(model: NeonCatalogModel): Array<InputModality> {
  const mapped = new Set<InputModality>(['text'])
  for (const modality of model.modalities?.input ?? []) {
    const known = MODALITY_MAP[modality.toLowerCase()]
    if (known) mapped.add(known)
  }
  return INPUT_MODALITY_ORDER.filter((modality) => mapped.has(modality))
}

/**
 * The model's `chat({ reasoning })` data, from its `effort` values. Both
 * OpenAI-shaped routes send one effort value (`reasoning_effort`, or
 * `reasoning.effort` on Responses), so no model takes a token budget here.
 */
function reasoningFor(model: NeonCatalogModel): ReasoningShape | undefined {
  if (!model.reasoning) return undefined
  const effort = model.reasoning_options?.find(
    (option) => option.type === 'effort',
  )
  const levels: ReasoningLevels = {}
  for (const value of effort?.values ?? []) {
    if (value === 'none') levels.off = 'none'
    else if (LEVELS.has(value)) levels[value as ReasoningLevel] = value
  }
  if (Object.keys(levels).length === 0) return undefined
  return { levels, budget: false }
}

function convertModels(): string {
  const anthropicIds = new Set<string>(ANTHROPIC_MODELS)
  const chat: Array<NeonCatalogModel> = []
  const embedding: Array<string> = []
  let unreleased = 0
  let unserved = 0

  for (const model of models) {
    if (model.released !== true) {
      unreleased += 1
      continue
    }
    const capabilities = model.capabilities ?? {}
    if (model.type === 'embedding') {
      if (capabilities.embeddings) embedding.push(model.id)
      continue
    }
    if (capabilities.chat !== 'not-served' || capabilities.responses) {
      chat.push(model)
    } else {
      unserved += 1
    }
  }

  chat.sort((a, b) => a.id.localeCompare(b.id))
  embedding.sort((a, b) => a.localeCompare(b))

  if (chat.length === 0) {
    throw new Error(
      'The Neon catalog produced no chat models. Refusing to overwrite model-meta.ts.',
    )
  }
  if (embedding.length === 0) {
    throw new Error(
      'The Neon catalog produced no embedding models. Refusing to overwrite model-meta.ts.',
    )
  }

  // A Claude id that ai-anthropic does not know yet stays on Chat Completions
  // until the provider-model sync adds it there.
  const anthropic = chat.filter(
    (model) =>
      model.capabilities?.native_dialect === 'anthropic' &&
      anthropicIds.has(model.id),
  )
  const anthropicSet = new Set(anthropic.map((model) => model.id))
  const responses = chat.filter((model) => model.capabilities?.responses)
  const responsesOnly = responses.filter(
    (model) => model.capabilities?.chat === 'not-served',
  )
  const rejectsSampling = chat.filter((model) => model.temperature === false)
  // Measured against the gateway: every Gemini-dialect model 400s on
  // `stream_options` on Chat Completions, and streams usage without it.
  const rejectsStreamOptions = chat.filter(
    (model) => model.capabilities?.native_dialect === 'gemini',
  )

  console.log(
    `Classified ${models.length} models: chat=${chat.length} (anthropic=${anthropic.length} responses=${responses.length} responses-only=${responsesOnly.length}) embedding=${embedding.length} unreleased=${unreleased} unserved=${unserved}`,
  )

  const shapes: Array<ReasoningShape> = []
  const reasoningEntries: Array<string> = []
  for (const model of chat) {
    // ai-anthropic owns the reasoning data of the models it serves.
    if (anthropicSet.has(model.id)) continue
    const shape = reasoningFor(model)
    if (!shape) continue
    shapes.push(shape)
    reasoningEntries.push(
      `  ${JSON.stringify(model.id)}: ${reasoningShapeName(shape)},`,
    )
  }

  const ids = (rows: Array<NeonCatalogModel>) => rows.map((model) => model.id)
  const modalityEntries = chat
    .map(
      (model) =>
        `  ${JSON.stringify(model.id)}: [${inputModalitiesFor(model)
          .map((modality) => `'${modality}'`)
          .join(', ')}],`,
    )
    .join('\n')

  return `/**
 * This file is generated by scripts/convert-neon-models.ts. Do not edit by hand.
 */

import type { ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'

/** Every chat model the gateway serves, on any route. */
export const NEON_CHAT_MODELS = ${formatStringArray(ids(chat))}

export type NeonChatModel = (typeof NEON_CHAT_MODELS)[number]

/** Claude models. \`neonText\` sends them to the Anthropic Messages route. */
export const NEON_ANTHROPIC_MODELS = ${formatStringArray(ids(anthropic))}

export type NeonAnthropicModel = (typeof NEON_ANTHROPIC_MODELS)[number]

/** Models the Responses route serves. They take \`api: 'responses'\`. */
export const NEON_RESPONSES_MODELS = ${formatStringArray(ids(responses))}

export type NeonResponsesModel = (typeof NEON_RESPONSES_MODELS)[number]

/** Models only the Responses route serves. \`neonText\` always sends them there. */
export const NEON_RESPONSES_ONLY_MODELS = ${formatStringArray(ids(responsesOnly))}

export type NeonResponsesOnlyModel = (typeof NEON_RESPONSES_ONLY_MODELS)[number]

export const NEON_EMBEDDING_MODELS = ${formatStringArray(embedding)}

export type NeonEmbeddingModel = (typeof NEON_EMBEDDING_MODELS)[number]

/** Models that reject \`temperature\` and \`top_p\`. The adapters drop both. */
export const NEON_MODELS_REJECTING_SAMPLING: ReadonlySet<string> = new Set(${formatStringArray(ids(rejectsSampling))})

/**
 * Models that reject \`stream_options\` on Chat Completions. They stream
 * usage without it.
 */
export const NEON_MODELS_REJECTING_STREAM_OPTIONS: ReadonlySet<string> = new Set(${formatStringArray(ids(rejectsStreamOptions))})

/** The input modalities of each chat model. */
export const NEON_MODEL_INPUT_MODALITIES = {
${modalityEntries}
} as const satisfies Record<NeonChatModel, ReadonlyArray<string>>

export type NeonModelInputModalitiesByName = typeof NEON_MODEL_INPUT_MODALITIES

// Reasoning
//
// Each model's data for \`chat({ reasoning })\`: the levels it has, with the
// effort value the gateway takes for each. Each model points at one shape.

${reasoningShapeTable(shapes).code}

const NEON_REASONING = {
${reasoningEntries.join('\n')}
} satisfies Partial<Record<NeonChatModel, ModelReasoning>>

/**
 * Each chat model's reasoning levels, for \`chat({ reasoning })\`. A model
 * that is not here does not reason.
 */
export type NeonModelReasoningByName = {
  [K in keyof typeof NEON_REASONING]: ModelReasoningCapability<
    (typeof NEON_REASONING)[K]
  >
}

/**
 * Runtime map from chat model id to its reasoning data, for the text
 * adapters. An unknown id gives \`undefined\`: the adapter sends no reasoning
 * field.
 */
export const NEON_MODEL_REASONING: Readonly<Record<string, ModelReasoning>> =
  NEON_REASONING
`
}

async function main() {
  await writeFile(OUTPUT_PATH, convertModels(), 'utf-8')
  console.log(`Model meta file written to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
