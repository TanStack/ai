import { test, expect } from './fixtures'

for (const model of ['cohere.rerank-v3-5:0', 'amazon.rerank-v1:0']) {
  for (const top of ['1', 'all']) {
    test(`bedrock rerank ${model}: ${top === '1' ? 'top result' : 'all results across pages'}`, async ({
      request,
      testId,
    }) => {
      const params = new URLSearchParams({ model, top, testId })
      const response = await request.post(`/api/bedrock-rerank?${params}`)
      expect(response.status(), await response.text()).toBe(200)
      const expectedRanking = [
        {
          index: 1,
          score: 0.98,
          document: { id: 'rain', text: 'rainy afternoon in the city' },
        },
        {
          index: 2,
          score: 0.3,
          document: { id: 'snow', text: 'snow in the mountains' },
        },
        {
          index: 0,
          score: 0.1,
          document: { id: 'sun', text: 'sunny day at the beach' },
        },
      ].slice(0, top === '1' ? 1 : 3)
      expect(await response.json()).toEqual({
        id: 'rerank-page-1',
        model,
        ranking: expectedRanking,
        rerankedDocuments: expectedRanking.map(({ document }) => document),
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        originalDocumentsPreserved: true,
      })
    })
  }
}
