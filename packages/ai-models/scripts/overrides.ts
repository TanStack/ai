import type { ModelRecord } from '../src/types'

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
        reasoning: true,
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
        reasoning: true,
        // The router picks a model per call, so the price is not known ahead.
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 2000000,
        maxTokens: 4096,
      },
    ],
  }

/**
 * Corrections for single models, merged over the generated record. Keep a
 * comment on each one that says why.
 */
export const MODEL_OVERRIDES: Readonly<
  Record<string, Readonly<Record<string, Partial<ModelRecord>>>>
> = {}
