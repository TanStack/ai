import { createServerFn } from '@tanstack/react-start'
import { rerank } from '@tanstack/ai'
import { COHERE_RERANK_MODELS, cohereRerank } from '@tanstack/ai-cohere'
import { openRouterRerank } from '@tanstack/ai-openrouter'
import { SUPPORT_DOCS } from './documents'
import { isProvider } from './models'
import type { CohereRerankModel } from '@tanstack/ai-cohere'
import type { Provider } from './models'

interface RerankInput {
  query: string
  provider: Provider
  model: string
  topN: number
}

/**
 * Narrows a wire string to a Cohere rerank model. The `cohereRerank` factory is
 * generic over the model literal, so the model has to be a known slug before it
 * reaches the adapter — a plain `string` would not type-check.
 */
function isCohereRerankModel(model: string): model is CohereRerankModel {
  return COHERE_RERANK_MODELS.some((known) => known === model)
}

/**
 * Reranks the support corpus against a query.
 *
 * The API key never leaves the server: both adapters read their key from the
 * environment (`COHERE_API_KEY` / `OPENROUTER_API_KEY`) inside this handler.
 *
 * Note the two branches call the *same* `rerank()` with a different adapter —
 * that is the provider-agnostic contract. They are written out separately
 * rather than sharing an `adapter` variable so each call site keeps the
 * adapter's literal model type, and with it the per-model `modelOptions`
 * inference.
 */
export const rerankDocumentsFn = createServerFn({ method: 'POST' })
  .inputValidator((data: RerankInput) => {
    if (!data.query.trim()) throw new Error('Query is required')
    if (!isProvider(data.provider)) {
      throw new Error(`Unknown provider: ${data.provider}`)
    }
    if (!data.model) throw new Error('Model is required')
    if (!Number.isInteger(data.topN) || data.topN < 1) {
      throw new Error('topN must be a positive integer')
    }
    return data
  })
  .handler(async ({ data }) => {
    const { query, model, topN } = data

    if (data.provider === 'cohere') {
      if (!isCohereRerankModel(model)) {
        throw new Error(`Unknown Cohere rerank model: ${model}`)
      }
      return await rerank({
        adapter: cohereRerank(model),
        query,
        // Object documents: JSON-serialized on the way out, and the original
        // `SupportDoc` comes back on `ranking[n].document`.
        documents: SUPPORT_DOCS,
        topN,
        // Per-model provider option, typed by the `cohereRerank(model)` literal.
        modelOptions: { maxTokensPerDoc: 4096 },
      })
    }

    return await rerank({
      adapter: openRouterRerank(model),
      query,
      documents: SUPPORT_DOCS,
      topN,
    })
  })
