import type { ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'

// Reasoning shapes: the levels a model has for `chat({ reasoning })`, and
// the provider value to send for each. Each model points at one of them.
const EFFORT_LOW_TO_HIGH = {
  levels: { low: 'low', medium: 'medium', high: 'high' },
  budget: false,
} as const
const EFFORT_LOW_TO_XHIGH = {
  levels: { low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh' },
  budget: false,
} as const
const EFFORT_NONE_LOW_TO_HIGH = {
  levels: { off: 'none', low: 'low', medium: 'medium', high: 'high' },
  budget: false,
} as const
const EFFORT_NONE_LOW_TO_XHIGH = {
  levels: {
    off: 'none',
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
  },
  budget: false,
} as const
/**
 * Models known to work with Codex. The harness accepts any OpenAI model id
 * its backend supports, so this list exists for autocomplete — any string is
 * accepted via the `(string & {})` escape hatch in {@link CodexModel}.
 */
export const CODEX_MODELS = [
  'gpt-5.3-codex',
  'gpt-5.2-codex',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5.1',
] as const

export type KnownCodexModel = (typeof CODEX_MODELS)[number]

/** Any model id accepted by Codex; known ids get autocomplete. */
export type CodexModel = KnownCodexModel | (string & {})

// Reasoning
//
// Each model's data for `chat({ reasoning })`: the levels it has, with the
// provider value for each, and whether it takes a thinking token budget. The
// data comes from models.dev. The generator that writes it comes with the model
// catalog later. Until then, edit these entries by hand.

const CODEX_REASONING = {
  'gpt-5.3-codex': EFFORT_NONE_LOW_TO_XHIGH,
  'gpt-5.2-codex': EFFORT_LOW_TO_XHIGH,
  'gpt-5.1-codex': EFFORT_LOW_TO_HIGH,
  'gpt-5.1-codex-mini': EFFORT_LOW_TO_HIGH,
  'gpt-5.1': EFFORT_NONE_LOW_TO_HIGH,
} satisfies Partial<Record<KnownCodexModel, ModelReasoning>>

/**
 * Each model's reasoning levels, and whether it takes a token budget, for
 * `chat({ reasoning })`. A model that is not here does not reason.
 */
export type CodexModelReasoningByName = {
  [K in keyof typeof CODEX_REASONING]: ModelReasoningCapability<
    (typeof CODEX_REASONING)[K]
  >
}

/**
 * Runtime map from model id to its reasoning data, for the text adapter. An
 * unknown id gives `undefined`: the adapter sends no reasoning field.
 */
export const CODEX_MODEL_REASONING: Readonly<Record<string, ModelReasoning>> =
  CODEX_REASONING
