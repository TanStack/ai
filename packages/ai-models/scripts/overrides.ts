import { DEFAULT_LEVELS } from './rules'
import type { ModelReasoning, ModelRecord, ReasoningLevel } from '../src/types'

/** A model record without the fields its provider row fills in. */
export type ExtraModel = Omit<ModelRecord, 'provider' | 'api' | 'baseUrl'> &
  Partial<Pick<ModelRecord, 'api' | 'baseUrl'>>

/**
 * Models that no source has, written by hand. Values from the provider's
 * price page (as pi 0.87.1 lists them).
 */
export const EXTRA_MODELS: Readonly<Record<string, ReadonlyArray<ExtraModel>>> =
  {
    mistral: [
      {
        id: 'magistral-small',
        name: 'Magistral Small',
        input: ['text'],
        reasoning: { levels: DEFAULT_LEVELS, budget: false },
        cost: { input: 0.5, output: 1.5, cacheRead: 0.05, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 128000,
      },
    ],
    openrouter: [
      {
        id: 'openrouter/auto-beta',
        name: 'Auto Router (Beta)',
        input: ['text', 'image'],
        reasoning: { levels: DEFAULT_LEVELS, budget: false },
        // The router picks a model per call, so the price is not known ahead.
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 2000000,
        maxTokens: 4096,
      },
    ],
  }

/** Effort levels: `off` when given, and the named levels as their own name. */
function effort(
  budget: boolean,
  off: string | null,
  ...levels: Array<ReasoningLevel>
): ModelReasoning {
  return {
    levels: {
      ...(off === null ? {} : { off }),
      ...Object.fromEntries(levels.map((level) => [level, level])),
    },
    budget,
  }
}

/**
 * Corrections for single models, merged over the generated record. Keep a
 * comment on each one that says why.
 */
export const MODEL_OVERRIDES: Readonly<
  Record<string, Readonly<Record<string, Partial<ModelRecord>>>>
> = {
  // Fireworks' own effort levels on its Anthropic endpoint (pi 0.87.1).
  // models.dev has no levels for these, and the record borrows the levels
  // of the same model at another provider.
  fireworks: {
    'accounts/fireworks/models/deepseek-v4-flash-0731': {
      reasoning: effort(false, 'none', 'low', 'high', 'max'),
    },
    'accounts/fireworks/models/deepseek-v4-pro': {
      reasoning: effort(false, 'none', 'high', 'max'),
    },
    'accounts/fireworks/models/deepseek-v4-pro-0813': {
      reasoning: effort(false, 'none', 'low', 'high', 'max'),
    },
    'accounts/fireworks/models/muse-glimmer-30b': {
      reasoning: effort(false, null, 'low', 'medium', 'high', 'xhigh'),
    },
    'accounts/fireworks/models/qwen3p7-plus': {
      reasoning: effort(true, 'none', 'low', 'medium', 'high'),
    },
    'accounts/fireworks/models/qwen3p8-max': {
      reasoning: effort(false, 'none', 'low', 'medium', 'xhigh'),
    },
    'accounts/fireworks/routers/deepseek-pro-latest': {
      reasoning: effort(false, 'none', 'high', 'max'),
    },
  },
  // models.dev lists no reasoning for it at Vercel. Vercel's own model list
  // tags it `reasoning`, and Google, OpenRouter, and pi 0.87.1 list it.
  'vercel-ai-gateway': {
    'google/gemma-4-31b-it': {
      reasoning: { levels: DEFAULT_LEVELS, budget: false },
    },
  },
}
