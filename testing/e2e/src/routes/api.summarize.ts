import { createFileRoute } from '@tanstack/react-router'
import { summarize, toServerSentEventsResponse } from '@tanstack/ai'
import { createOpenaiSummarize } from '@tanstack/ai-openai'
import { createAnthropicSummarize } from '@tanstack/ai-anthropic'
import { createGeminiSummarize } from '@tanstack/ai-gemini'
import { createOllamaSummarize } from '@tanstack/ai-ollama'
import { createGroqSummarize } from '@tanstack/ai-groq'
import { createGrokSummarize } from '@tanstack/ai-grok'
import { createOpenRouterSummarize } from '@tanstack/ai-openrouter'
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

function createSummarizeAdapter(
  provider: Provider,
  aimockPort?: number,
  testId?: string,
) {
  const headers = testHeaders(testId)
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiSummarize('gpt-4o', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    anthropic: () =>
      createAnthropicSummarize('claude-sonnet-4-5', DUMMY_KEY, {
        baseURL: llmockBase(aimockPort),
        defaultHeaders: headers,
      }),
    gemini: () =>
      createGeminiSummarize(DUMMY_KEY, 'gemini-2.5-flash', {
        httpOptions: { baseUrl: llmockBase(aimockPort), headers },
      }),
    ollama: () => createOllamaSummarize('mistral', llmockBase(aimockPort)),
    groq: () =>
      createGroqSummarize('llama-3.3-70b-versatile', DUMMY_KEY, {
        baseURL: llmockBase(aimockPort),
        defaultHeaders: headers,
      }),
    grok: () =>
      createGrokSummarize('grok-build-0.1', DUMMY_KEY, {
        baseURL: openaiUrl(aimockPort),
        defaultHeaders: headers,
      }),
    // Both OpenRouter provider rows use the OpenRouter summarize adapter:
    // `createOpenRouterSummarize` wraps the OpenRouter chat-completions
    // text adapter regardless of whether the caller selected the Chat
    // Completions or Responses surface, so a single factory backs both
    // matrix entries.
    openrouter: () =>
      createOpenRouterSummarize('openai/gpt-4o', DUMMY_KEY, {
        serverURL: openaiUrl(aimockPort),
        headers,
      }),
    'openrouter-responses': () =>
      createOpenRouterSummarize('openai/gpt-4o', DUMMY_KEY, {
        serverURL: openaiUrl(aimockPort),
        headers,
      }),
  }
  return factories[provider]?.()
}

export const Route = createFileRoute('/api/summarize')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body = await request.json()
        const data = body.forwardedProps ?? body.data ?? body
        const {
          text,
          provider,
          stream: shouldStream,
          testId,
          aimockPort,
        } = data as {
          text: string
          provider: Provider
          stream?: boolean
          testId?: string
          aimockPort?: number
        }

        try {
          const adapter = createSummarizeAdapter(provider, aimockPort, testId)
          if (!adapter) {
            return new Response(
              JSON.stringify({
                error: `Provider ${provider} does not support summarize`,
              }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            )
          }
          // Split into two branches so `summarize` returns the narrow
          // type per call (`Promise<SummarizationResult>` vs
          // `AsyncIterable<AGUIEvent>`) — the merged union return is not
          // statically narrowable by a later `shouldStream === false`
          // check on the result variable.
          if (shouldStream === false) {
            const summary = await summarize({ adapter, text, stream: false })
            return new Response(JSON.stringify({ summary }), {
              headers: { 'Content-Type': 'application/json' },
            })
          }
          const stream = summarize({ adapter, text, stream: true })
          return toServerSentEventsResponse(stream)
        } catch (error) {
          console.error('[api.summarize] Error:', error)
          if (error instanceof Error && error.name === 'AbortError') {
            return new Response(null, { status: 499 })
          }
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
