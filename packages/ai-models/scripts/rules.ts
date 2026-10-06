import type { Wire } from './providers'
import type {
  InputModality,
  ModelCompat,
  ReasoningLevel,
  ReasoningMap,
} from '../src/types'

/** One entry of models.dev `reasoning_options`. */
export type ReasoningOptionEntry =
  | { type: 'effort'; values?: ReadonlyArray<string> }
  | { type: 'toggle' }
  | { type: 'budget_tokens'; min?: number; max?: number }
  | { type: string }

/** The fields of a models.dev model that the generator reads. */
export interface DevModel {
  id: string
  name?: string
  reasoning?: boolean
  reasoning_options?: ReadonlyArray<ReasoningOptionEntry>
  interleaved?: boolean | { field?: string }
  temperature?: boolean
  modalities?: {
    input?: ReadonlyArray<string>
    output?: ReadonlyArray<string>
  }
  cost?: {
    input?: number
    output?: number
    cache_read?: number
    cache_write?: number
    tiers?: ReadonlyArray<{
      input?: number
      output?: number
      cache_read?: number
      cache_write?: number
      tier?: { type?: string; size?: number }
    }>
  }
  limit?: { context?: number; output?: number }
  provider?: { npm?: string; api?: string }
  canonical_model_id?: string
  status?: string
}

const THINKING_LEVELS: ReadonlyArray<Exclude<ReasoningLevel, 'off'>> = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

const effortValues = (
  options: ReadonlyArray<ReasoningOptionEntry>,
): ReadonlyArray<string> | undefined => {
  const effort = options.find((option) => option.type === 'effort')
  if (!effort || !('values' in effort)) return undefined
  return effort.values
}

/**
 * The level map from models.dev `reasoning_options`:
 * - `effort` values: each value names its level, `none` is the `off` value,
 *   and a level the model does not list is `null`. A `toggle` next to it
 *   also gives `off: 'none'`.
 * - `toggle` alone: only `off` and `high`.
 * - `budget_tokens` alone, or nothing: no map (every level up to `high`
 *   passes, and the adapter turns it into a budget).
 */
export function reasoningMapFrom(
  options: ReadonlyArray<ReasoningOptionEntry> | undefined,
): ReasoningMap | undefined {
  if (!options || options.length === 0) return undefined
  const values = effortValues(options)
  const toggle = options.some((option) => option.type === 'toggle')
  if (values && values.length > 0) {
    const map: ReasoningMap = {
      off: values.includes('none') || toggle ? 'none' : null,
    }
    for (const level of THINKING_LEVELS)
      map[level] = values.includes(level) ? level : null
    return map
  }
  if (toggle)
    return { off: 'off', minimal: null, low: null, medium: null, high: 'high' }
  return undefined
}

/** `true` when the model takes a thinking token budget. */
export function takesBudget(
  options: ReadonlyArray<ReasoningOptionEntry> | undefined,
): boolean {
  return (options ?? []).some((option) => option.type === 'budget_tokens')
}

/** The model hints models.dev has for the wire quirks. */
export function modelHints(
  model: DevModel,
  wire: Wire,
  effortByModel: boolean,
): ModelCompat {
  const hints: ModelCompat = {}
  const interleaved = model.interleaved
  const replayField =
    typeof interleaved === 'object' ? interleaved.field : undefined
  if (wire.api === 'openai-completions' && replayField === 'reasoning_content')
    hints.requiresReasoningContentOnAssistantMessages = true
  if (model.temperature === false) hints.supportsTemperature = false
  const options = model.reasoning_options ?? []
  // Claude with `effort` and no token budget thinks adaptively only.
  if (
    wire.api === 'anthropic-messages' &&
    effortValues(options) !== undefined &&
    !takesBudget(options)
  )
    hints.forceAdaptiveThinking = true
  if (effortByModel && wire.api === 'openai-completions')
    hints.supportsReasoningEffort = (effortValues(options)?.length ?? 0) > 0
  return hints
}

const INPUTS: ReadonlyArray<InputModality> = [
  'text',
  'image',
  'audio',
  'video',
  'document',
]

/** models.dev input kinds, in the catalog's names. `pdf` and `file` are documents. */
export function inputModalities(
  input: ReadonlyArray<string> | undefined,
): ReadonlyArray<InputModality> {
  const mapped = (input ?? ['text']).map((kind) =>
    kind === 'pdf' || kind === 'file' ? 'document' : kind,
  )
  const known = INPUTS.filter((kind) => mapped.includes(kind))
  return known.length > 0 ? known : ['text']
}

/** A model that makes text (not only images, speech, or embeddings). */
export function makesText(model: DevModel): boolean {
  return (model.modalities?.output ?? ['text']).includes('text')
}

/**
 * The form of a model id used to find the same model at another provider:
 * the last path part, in lower case, with no `:free` or `:batch`, and with
 * dots and `p` version separators as dashes (`4.5` and `k2p6` match `4-5`
 * and `k2-6`).
 */
export function normalizeModelId(id: string): string {
  return (id.split('/').pop() ?? id)
    .toLowerCase()
    .replace(/:(free|batch)$/, '')
    .replace(/-free$/, '')
    .replace(/(\d)p(\d)/g, '$1-$2')
    .replace(/\./g, '-')
}

/** The model maker to prefer when the same model is at many providers. */
const MAKERS: ReadonlyArray<readonly [RegExp, ReadonlyArray<string>]> = [
  [/claude/i, ['anthropic']],
  [/^(gpt|o\d|chatgpt|codex)/i, ['openai']],
  [/gemini|gemma/i, ['google']],
  [/deepseek/i, ['deepseek']],
  [/kimi/i, ['moonshotai']],
  [/glm/i, ['zai']],
  [/minimax/i, ['minimax']],
  [/mistral|magistral|codestral|ministral|devstral/i, ['mistral']],
  [/grok/i, ['xai']],
  [/qwen/i, ['alibaba']],
]

/**
 * The same model at another provider: by the normalized id, else by
 * `canonical_model_id`. The model maker wins over a reseller.
 */
export function findSameModel(
  dev: Readonly<Record<string, { models: Readonly<Record<string, DevModel>> }>>,
  id: string,
): { source: string; model: DevModel } | undefined {
  const key = normalizeModelId(id)
  const byId: Array<{ source: string; model: DevModel }> = []
  const byCanonical: Array<{ source: string; model: DevModel }> = []
  for (const [provider, { models }] of Object.entries(dev))
    for (const [modelId, model] of Object.entries(models)) {
      if (normalizeModelId(modelId) === key)
        byId.push({ source: `${provider}/${modelId}`, model })
      else if (
        model.canonical_model_id &&
        normalizeModelId(model.canonical_model_id) === key
      )
        byCanonical.push({ source: `${provider}/${modelId}`, model })
    }
  const hits = byId.length > 0 ? byId : byCanonical
  const name = id.split('/').pop() ?? id
  const makers = MAKERS.find(([pattern]) => pattern.test(name))?.[1] ?? []
  for (const maker of makers) {
    const hit = hits.find((entry) => entry.source.startsWith(`${maker}/`))
    if (hit) return hit
  }
  return hits[0]
}
