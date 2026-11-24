import { describe, expect, it } from 'vitest'
import { createCohereEmbedding } from '../src/adapters/embedding'
import { createCohereRerank } from '../src/adapters/rerank'

describe('Cohere defaultModelOptions', () => {
  it('embedding adapter stores the defaults', () => {
    const adapter = createCohereEmbedding('embed-v4.0', 'test-key', {
      defaultModelOptions: { inputType: 'search_document' },
    })

    expect(adapter.defaultModelOptions).toEqual({
      inputType: 'search_document',
    })
  })

  it('rerank adapter stores the defaults', () => {
    const adapter = createCohereRerank('rerank-v3.5', 'test-key', {
      defaultModelOptions: { maxTokensPerDoc: 512 },
    })

    expect(adapter.defaultModelOptions).toEqual({ maxTokensPerDoc: 512 })
  })
})
