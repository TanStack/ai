import type { ModelReasoning, ModelReasoningCapability } from '@tanstack/ai'
/**
 * Models known to work with Claude Code. The harness accepts any Anthropic
 * model id (and the `opus` / `sonnet` / `haiku` aliases resolved by the CLI),
 * so this list exists for autocomplete — any string is accepted via the
 * `(string & {})` escape hatch in {@link ClaudeCodeModel}.
 */
export const CLAUDE_CODE_MODELS = [
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'opus',
  'sonnet',
  'haiku',
] as const

export type KnownClaudeCodeModel = (typeof CLAUDE_CODE_MODELS)[number]

/** Any Claude model id accepted by Claude Code; known ids get autocomplete. */
export type ClaudeCodeModel = KnownClaudeCodeModel | (string & {})

// Reasoning
//
// Each model's data for `chat({ reasoning })`: the provider value for each
// level (`null`: the model does not have it), and whether it takes a
// thinking token budget. The data comes from models.dev. The generator that
// writes it comes with the model catalog later. Until then, edit these
// entries by hand.

const CLAUDE_CODE_REASONING = {
  'claude-opus-4-8': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
      max: 'max',
    },
    budget: false,
  },
  'claude-opus-4-7': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
      max: 'max',
    },
    budget: false,
  },
  'claude-opus-4-6': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: 'max',
    },
    budget: true,
  },
  'claude-sonnet-4-6': {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: 'max',
    },
    budget: true,
  },
  'claude-haiku-4-5': { budget: true },
  opus: {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: 'xhigh',
      max: 'max',
    },
    budget: false,
  },
  sonnet: {
    map: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: null,
      max: 'max',
    },
    budget: true,
  },
  haiku: { budget: true },
} as const satisfies Partial<Record<KnownClaudeCodeModel, ModelReasoning>>

/**
 * Each model's reasoning levels, and whether it takes a token budget, for
 * `chat({ reasoning })`. A model that is not here does not reason.
 */
export type ClaudeCodeModelReasoningByName = {
  [K in keyof typeof CLAUDE_CODE_REASONING]: ModelReasoningCapability<
    (typeof CLAUDE_CODE_REASONING)[K]
  >
}

/**
 * Runtime map from model id to its reasoning data, for the text adapter. An
 * unknown id gives `undefined`: the adapter sends no reasoning field.
 */
export const CLAUDE_CODE_MODEL_REASONING: Readonly<
  Record<string, ModelReasoning>
> = CLAUDE_CODE_REASONING
