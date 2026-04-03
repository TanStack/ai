import { createFileRoute } from '@tanstack/react-router'
import { summarize, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'
import { anthropicSummarize } from '@tanstack/ai-anthropic'
import { geminiSummarize } from '@tanstack/ai-gemini'
import { ollamaSummarize } from '@tanstack/ai-ollama'
import { grokSummarize } from '@tanstack/ai-grok'
import type { Provider } from '@/lib/types'

const LLMOCK_URL = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

function createSummarizeAdapter(provider: Provider) {
  const factories: Record<string, () => any> = {
    openai: () => openaiSummarize({ baseURL: LLMOCK_URL }),
    anthropic: () => anthropicSummarize({ baseURL: LLMOCK_URL }),
    gemini: () => geminiSummarize({ baseURL: LLMOCK_URL }),
    ollama: () => ollamaSummarize({ host: LLMOCK_URL }),
    grok: () => grokSummarize({ baseURL: LLMOCK_URL }),
    openrouter: () => openaiSummarize({ baseURL: LLMOCK_URL }),
  }
  return factories[provider]?.() ?? factories.openai!()
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
