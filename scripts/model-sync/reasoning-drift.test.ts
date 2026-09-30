import { describe, expect, it } from 'vitest'
import { getModel } from '../../packages/ai-models/src'
import { ANTHROPIC_MODEL_REASONING } from '../../packages/ai-anthropic/src/model-reasoning'
import { BEDROCK_MODEL_REASONING } from '../../packages/ai-bedrock/src/model-reasoning'
import { CLOUDFLARE_MODEL_REASONING } from '../../packages/ai-cloudflare/src/model-reasoning'
import { GEMINI_MODEL_REASONING } from '../../packages/ai-gemini/src/model-reasoning'
import { GROK_MODEL_REASONING } from '../../packages/ai-grok/src/model-reasoning'
import { GROQ_MODEL_REASONING } from '../../packages/ai-groq/src/model-reasoning'
import { MISTRAL_MODEL_REASONING } from '../../packages/ai-mistral/src/model-reasoning'
import { OPENAI_MODEL_REASONING } from '../../packages/ai-openai/src/model-reasoning'
import { OPENROUTER_MODEL_REASONING } from '../../packages/ai-openrouter/src/model-reasoning'
import { VERCEL_GATEWAY_MODEL_REASONING } from '../../packages/ai-vercel-gateway/src/model-reasoning'
import type { ModelReasoning } from '../../packages/ai/src/reasoning'

// A provider package and the catalog read the same models.dev data. For a
// model that is in both, the reasoning levels must be the same.
const PAIRS: ReadonlyArray<
  readonly [string, string, Readonly<Record<string, ModelReasoning>>]
> = [
  ['ai-openai', 'openai', OPENAI_MODEL_REASONING],
  ['ai-anthropic', 'anthropic', ANTHROPIC_MODEL_REASONING],
  ['ai-gemini', 'google', GEMINI_MODEL_REASONING],
  ['ai-grok', 'xai', GROK_MODEL_REASONING],
  ['ai-groq', 'groq', GROQ_MODEL_REASONING],
  ['ai-openrouter', 'openrouter', OPENROUTER_MODEL_REASONING],
  ['ai-bedrock', 'amazon-bedrock', BEDROCK_MODEL_REASONING],
  ['ai-mistral', 'mistral', MISTRAL_MODEL_REASONING],
  ['ai-vercel-gateway', 'vercel-ai-gateway', VERCEL_GATEWAY_MODEL_REASONING],
  ['ai-cloudflare', 'cloudflare-workers-ai', CLOUDFLARE_MODEL_REASONING],
]

describe('reasoning drift between provider packages and @tanstack/ai-models', () => {
  it.each(PAIRS)('%s matches the %s catalog', (_pkg, provider, reasoning) => {
    let compared = 0
    for (const [id, own] of Object.entries(reasoning)) {
      const record = getModel(provider, id)
      if (!record) continue
      compared++
      const fromCatalog: ModelReasoning = record.reasoning
        ? {
            ...(record.reasoningMap ? { map: record.reasoningMap } : {}),
            budget: record.reasoningBudget === true,
          }
        : false
      expect(own, `${provider}/${id}`).toEqual(fromCatalog)
    }
    expect(compared).toBeGreaterThan(0)
  })
})
