import { createFileRoute } from '@tanstack/react-router'
import { generateSpeech, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'
import type { Provider } from '@/lib/types'

const LLMOCK_URL = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

function createTTSAdapter(provider: Provider) {
  const factories: Record<string, () => any> = {
    openai: () => openaiSpeech({ baseURL: LLMOCK_URL }),
  }
  return factories[provider]?.()
}

export const Route = createFileRoute('/api/tts')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body = await request.json()
        const { text, provider } = body

        const adapter = createTTSAdapter(provider)
        if (!adapter) {
          return new Response(JSON.stringify({ error: 'Provider does not support TTS' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        try {
          const stream = generateSpeech({ adapter, text, stream: true })
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
