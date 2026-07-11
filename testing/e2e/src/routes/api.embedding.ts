import { createFileRoute } from '@tanstack/react-router'
import { embed } from '@tanstack/ai'
import { createOpenaiEmbedding } from '@tanstack/ai-openai'
import { createGeminiEmbedding } from '@tanstack/ai-gemini'
import { createMistralEmbedding } from '@tanstack/ai-mistral'
import { createOllamaEmbedding } from '@tanstack/ai-ollama'
import type { Provider } from '@/lib/types'

const LLMOCK_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

function llmockBase(aimockPort?: number): string {
  if (aimockPort) return `http://127.0.0.1:${aimockPort}`
  return LLMOCK_BASE
}

function openaiUrl(aimockPort?: number): string {
  return `${llmockBase(aimockPort)}/v1`
}

function testHeaders(testId?: string): Record<string, string> | undefined {
  return testId ? { 'X-Test-Id': testId } : undefined
}

/**
 * Embedding adapters pointed at aimock. Coverage notes (mirrored in
 * `src/lib/feature-support.ts`):
 *
 * - openai: aimock 1.34 natively mocks POST /v1/embeddings — the JSON
 *   fixture lives in `fixtures/embedding/basic.json`.
 * - gemini: `@google/genai` posts to `{model}:batchEmbedContents` on the
 *   MLDev (API-key) surface, which aimock doesn't model (it only handles
 *   `:embedContent`) — served by `geminiBatchEmbedMount` in global-setup.ts.
 * - ollama: the ollama SDK's `embed()` hits POST /api/embed and expects
 *   `embeddings: number[][]`; aimock's native handler answers with the
 *   legacy singular `embedding` field — served by `ollamaEmbedMount`.
 * - mistral: the Mistral SDK Zod-validates the /v1/embeddings response and
 *   requires an `id` field aimock's OpenAI-format builder omits — served by
 *   `mistralEmbeddingsMount` under the /mistral prefix.
 */
function createEmbeddingAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
) {
  const headers = testHeaders(testId)
  const factories: Partial<Record<Provider, () => any>> = {
    openai: () =>
      createOpenaiEmbedding('text-embedding-3-small', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    gemini: () =>
      createGeminiEmbedding('gemini-embedding-001', DUMMY_KEY, {
        httpOptions: { baseUrl: llmockBase(aimockPort), headers },
      }),
    mistral: () =>
      createMistralEmbedding('mistral-embed', DUMMY_KEY, {
        serverURL: `${llmockBase(aimockPort)}/mistral`,
        defaultHeaders: headers,
      }),
    ollama: () =>
      createOllamaEmbedding('nomic-embed-text', {
        host: llmockBase(aimockPort),
        headers,
      }),
  }
  return factories[provider]?.()
}

export const Route = createFileRoute('/api/embedding')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body = await request.json()
        const data = body.forwardedProps ?? body.data ?? body
        const { texts, provider, testId, aimockPort } = data as {
          texts: Array<string>
          provider: Provider
          testId?: string
          aimockPort?: number
        }

        try {
          const adapter = createEmbeddingAdapter(provider, aimockPort, testId)
          if (!adapter) {
            return new Response(
              JSON.stringify({
                error: `Provider ${provider} does not support embedding`,
              }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            )
          }
          // embed() is Promise-based — there is no streaming variant.
          const result = await embed({ adapter, input: texts })
          return new Response(
            JSON.stringify({
              embeddings: result.embeddings.map((e) => e.vector),
              model: result.model,
            }),
            { headers: { 'Content-Type': 'application/json' } },
          )
        } catch (error) {
          console.error('[api.embedding] Error:', error)
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
