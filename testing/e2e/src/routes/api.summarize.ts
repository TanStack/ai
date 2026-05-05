import { createFileRoute } from '@tanstack/react-router'
import { summarize, toServerSentEventsResponse } from '@tanstack/ai'
import { createOpenaiSummarize } from '@tanstack/ai-openai'
import { createAnthropicSummarize } from '@tanstack/ai-anthropic'
import { createGeminiSummarize } from '@tanstack/ai-gemini'
import { createOllamaSummarize } from '@tanstack/ai-ollama'
import { createGrokSummarize } from '@tanstack/ai-grok'
import type { Provider } from '@/lib/types'

const LLMOCK_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const LLMOCK_OPENAI = `${LLMOCK_BASE}/v1`
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

function createSummarizeAdapter(provider: Provider) {
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiSummarize('gpt-4o', DUMMY_KEY, { baseURL: LLMOCK_OPENAI }),
    anthropic: () =>
      createAnthropicSummarize('claude-sonnet-4-5', DUMMY_KEY, {
        baseURL: LLMOCK_BASE,
      }),
    gemini: () =>
      createGeminiSummarize(DUMMY_KEY, 'gemini-2.0-flash', {
        httpOptions: { baseUrl: LLMOCK_BASE },
      }),
    ollama: () => createOllamaSummarize('mistral', LLMOCK_BASE),
    grok: () =>
      createGrokSummarize('grok-3', DUMMY_KEY, { baseURL: LLMOCK_OPENAI }),
    openrouter: () =>
      createOpenaiSummarize('gpt-4o', DUMMY_KEY, { baseURL: LLMOCK_OPENAI }),
  }
  return factories[provider]?.()
}

export const Route = createFileRoute('/api/summarize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body = await request.json()
        const { text, provider, stream: shouldStream } = body

        try {
          const adapter = createSummarizeAdapter(provider)
          if (!adapter) {
            return new Response(
              JSON.stringify({
                error: `Provider ${provider} does not support summarize`,
              }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            )
          }
          const result = summarize({
            adapter,
            text,
            stream: shouldStream ?? true,
          })

          if (shouldStream === false) {
            const summary = await result
            return new Response(JSON.stringify({ summary }), {
              headers: { 'Content-Type': 'application/json' },
            })
          }

          return toServerSentEventsResponse(result)
        } catch (error: any) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
