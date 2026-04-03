import { createFileRoute } from '@tanstack/react-router'
import { generateImage, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { geminiImage } from '@tanstack/ai-gemini'
import { grokImage } from '@tanstack/ai-grok'
import type { Provider } from '@/lib/types'

const LLMOCK_URL = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

function createImageAdapter(provider: Provider) {
  const factories: Record<string, () => any> = {
    openai: () => openaiImage({ baseURL: LLMOCK_URL }),
    gemini: () => geminiImage({ baseURL: LLMOCK_URL }),
    grok: () => grokImage({ baseURL: LLMOCK_URL }),
  }
  return factories[provider]?.()
}

export const Route = createFileRoute('/api/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body = await request.json()
        const { prompt, provider } = body

        const adapter = createImageAdapter(provider)
        if (!adapter) {
          return new Response(JSON.stringify({ error: 'Provider does not support image generation' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        try {
          const stream = generateImage({ adapter, prompt, stream: true })
          return toServerSentEventsResponse(stream)
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
