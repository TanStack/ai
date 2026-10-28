import type { ModelReasoning } from '@tanstack/ai'
import type { ModelReasoningCapability } from '@tanstack/ai/adapter-internals'

// Reasoning shapes: the levels a model has for `chat({ reasoning })`, and
// the provider value to send for each. Each model points at one of them.
const BUDGET_LOW_TO_HIGH_MAX = {
  levels: { low: 'low', medium: 'medium', high: 'high', max: 'max' },
  budget: true,
} as const
const BUDGET_OFF_TO_HIGH = {
  levels: {
    off: 'off',
    minimal: 'minimal',
    low: 'low',
    medium: 'medium',
    high: 'high',
  },
  budget: true,
} as const
const EFFORT_LOW_TO_MAX = {
  levels: {
    low: 'low',
    medium: 'medium',
    high: 'high',
    xhigh: 'xhigh',
    max: 'max',
  },
  budget: false,
} as const
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
// Each model's data for `chat({ reasoning })`: the levels it has, with the
// provider value for each, and whether it takes a thinking token budget. The
// data comes from models.dev. The generator that writes it comes with the model
// catalog later. Until then, edit these entries by hand.

const CLAUDE_CODE_REASONING = {
  'claude-opus-4-8': EFFORT_LOW_TO_MAX,
  'claude-opus-4-7': EFFORT_LOW_TO_MAX,
  'claude-opus-4-6': BUDGET_LOW_TO_HIGH_MAX,
  'claude-sonnet-4-6': BUDGET_LOW_TO_HIGH_MAX,
  'claude-haiku-4-5': BUDGET_OFF_TO_HIGH,
  opus: EFFORT_LOW_TO_MAX,
  sonnet: BUDGET_LOW_TO_HIGH_MAX,
  haiku: BUDGET_OFF_TO_HIGH,
} satisfies Partial<Record<KnownClaudeCodeModel, ModelReasoning>>

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
