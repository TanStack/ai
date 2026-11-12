import { createFileRoute } from '@tanstack/react-router'
import { rerank } from '@tanstack/ai'
import { bedrockRerank } from '@tanstack/ai-bedrock'

const LLMOCK_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

export const Route = createFileRoute('/api/bedrock-rerank')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = new URL(request.url).searchParams
        const model = params.get('model')
        if (
          model !== 'cohere.rerank-v3-5:0' &&
          model !== 'amazon.rerank-v1:0'
        ) {
          return new Response('Unknown rerank model', { status: 400 })
        }
        const documents = [
          { id: 'sun', text: 'sunny day at the beach' },
          { id: 'rain', text: 'rainy afternoon in the city' },
          { id: 'snow', text: 'snow in the mountains' },
        ]
        const result = await rerank({
          adapter: bedrockRerank(model, {
            region: 'us-west-2',
            baseURL: `${LLMOCK_BASE}/bedrock-rerank`,
            defaultHeaders: { 'X-Test-Id': params.get('testId') ?? '' },
          }),
          query: 'talk about rain',
          documents,
          topN: params.get('top') === '1' ? 1 : undefined,
        })
        return Response.json({
          ...result,
          originalDocumentsPreserved: result.ranking.every(
            ({ index, document }) => document === documents[index],
          ),
        })
      },
    },
  },
})
