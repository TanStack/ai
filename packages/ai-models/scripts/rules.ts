import type { Wire } from './providers'
import type {
  InputModality,
  ModelCompat,
  ReasoningLevel,
  ReasoningLevels,
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
 * The levels of a model with no level data: every level up to `high`, each
 * sent as its own name. The adapter turns them into a budget when the model
 * takes one.
 */
export const DEFAULT_LEVELS: ReasoningLevels = {
  off: 'off',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
}

/**
 * The levels from models.dev `reasoning_options`:
 * - `effort` values: each value names its level, and `none` is the `off`
 *   value. A `toggle` next to it also gives `off: 'none'`. `default` with
 *   no `high` is the `high` value (Groq).
 * - `toggle` alone: only `off` and `high`.
 * - `budget_tokens` alone, or nothing: `DEFAULT_LEVELS`.
 */
export function reasoningLevelsFrom(
  options: ReadonlyArray<ReasoningOptionEntry> | undefined,
): ReasoningLevels {
  const values = effortValues(options ?? [])
  const toggle = (options ?? []).some((option) => option.type === 'toggle')
  if (values && values.length > 0) {
    const levels: ReasoningLevels =
      values.includes('none') || toggle ? { off: 'none' } : {}
    for (const level of THINKING_LEVELS)
      if (values.includes(level)) levels[level] = level
    if (!levels.high && values.includes('default')) levels.high = 'default'
    return levels
  }
  if (toggle) return { off: 'off', high: 'high' }
  return DEFAULT_LEVELS
}

/** `true` when the model takes a thinking token budget. */
export function takesBudget(
  options: ReadonlyArray<ReasoningOptionEntry> | undefined,
): boolean {
  return (options ?? []).some((option) => option.type === 'budget_tokens')
}

/** Claude 4.6 and later, with dash or dot ids (`claude-opus-4-7`, `anthropic/claude-opus-4.7`). */
const ADAPTIVE_CLAUDE =
  /claude-(?:(?:opus|sonnet)-4[.-][6-9]|(?:opus|sonnet|fable)-[5-9])/

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
  // pi's rule: Claude 4.6 and later think adaptively, on every provider of
  // the Anthropic wire. Another model on that wire thinks with a budget unless its
  // provider row says otherwise (models.dev lists `effort` for many models
  // that a gateway serves with budget thinking).
  if (wire.api === 'anthropic-messages' && ADAPTIVE_CLAUDE.test(model.id))
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

// ponytail: an id match. Embedding, reranking, and transcription models list
// text output too, and models.dev has no other field that tells them apart.
const NOT_CHAT = /embed|rerank|whisper|transcri/i

/** A chat model that makes text (not only images, speech, or embeddings). */
export function makesText(model: DevModel): boolean {
  return (
    (model.modalities?.output ?? ['text']).includes('text') &&
    !NOT_CHAT.test(model.id)
  )
}
