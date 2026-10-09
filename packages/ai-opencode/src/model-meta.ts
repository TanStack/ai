import type { ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'
/**
 * Models known to work with OpenCode. OpenCode is provider-agnostic — it
 * resolves any `provider/model` id its configured providers support (via the
 * Vercel AI SDK + Models.dev), so this list exists for autocomplete. Any
 * string is accepted via the `(string & {})` escape hatch in
 * {@link OpencodeModel}.
 *
 * Models are addressed as `provider_id/model_id` (e.g.
 * `anthropic/claude-sonnet-4-5`); the adapter splits on the first `/`.
 */
export const OPENCODE_MODELS = [
  'anthropic/claude-opus-4-5',
  'anthropic/claude-sonnet-4-5',
  'openai/gpt-5.2',
  'openai/gpt-5.1-codex',
  'google/gemini-3-pro-preview',
  'opencode/claude-sonnet-4-5',
  'opencode/gpt-5.1-codex',
] as const

export type KnownOpencodeModel = (typeof OPENCODE_MODELS)[number]

/** Any `provider/model` id accepted by OpenCode; known ids get autocomplete. */
export type OpencodeModel = KnownOpencodeModel | (string & {})

// Reasoning
//
// Each model's data for `chat({ reasoning })`: the provider value for each
// level (`null`: the model does not have it), and whether it takes a
// thinking token budget. The data comes from models.dev. The generator that
// writes it comes with the model catalog later. Until then, edit these
// entries by hand.

const OPENCODE_REASONING = {
  'anthropic/claude-opus-4-5': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: true,
  },
  'anthropic/claude-sonnet-4-5': { budget: true },
  'openai/gpt-5.2': {
    map: {
      off: 'none',
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
      max: null,
    },
    budget: false,
  },
  'openai/gpt-5.1-codex': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
  'opencode/claude-sonnet-4-5': { budget: true },
  'opencode/gpt-5.1-codex': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
} as const satisfies Partial<Record<KnownOpencodeModel, ModelReasoning>>

/**
 * Each model's reasoning levels, and whether it takes a token budget, for
 * `chat({ reasoning })`. A model that is not here does not reason.
 */
export type OpenCodeModelReasoningByName = {
  [K in keyof typeof OPENCODE_REASONING]: ModelReasoningCapability<
    (typeof OPENCODE_REASONING)[K]
  >
}

/**
 * Runtime map from model id to its reasoning data, for the text adapter. An
 * unknown id gives `undefined`: the adapter sends no reasoning field.
 */
export const OPENCODE_MODEL_REASONING: Readonly<
  Record<string, ModelReasoning>
> = OPENCODE_REASONING
