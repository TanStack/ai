import type { ModelReasoning, ModelReasoningCapability } from '@tanstack/ai'
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
// Each model's data for `chat({ reasoning })`: the provider value for each
// level (`null`: the model does not have it), and whether it takes a
// thinking token budget. The data comes from models.dev. The generator that
// writes it comes with the model catalog later. Until then, edit these
// entries by hand.

const CODEX_REASONING = {
  'gpt-5.3-codex': {
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
  'gpt-5.2-codex': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
      max: null,
    },
    budget: false,
  },
  'gpt-5.1-codex': {
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
  'gpt-5.1-codex-mini': {
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
  'gpt-5.1': {
    map: {
      off: 'none',
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: null,
    },
    budget: false,
  },
} as const satisfies Partial<Record<KnownCodexModel, ModelReasoning>>

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
