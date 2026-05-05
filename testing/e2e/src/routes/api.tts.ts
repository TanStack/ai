import { createFileRoute } from '@tanstack/react-router'
import { generateSpeech, toServerSentEventsResponse } from '@tanstack/ai'
import { createTTSAdapter } from '@/lib/media-providers'
import type { Provider } from '@/lib/types'

export const Route = createFileRoute('/api/tts')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.data ?? body
        const { text, voice, provider, testId, aimockPort } = data as {
          text: string
          voice?: string
          provider: Provider
          testId?: string
          aimockPort?: number
        }

        const adapter = createTTSAdapter(provider, aimockPort, testId)

        try {
          const stream = generateSpeech({ adapter, text, voice, stream: true })
          return toServerSentEventsResponse(stream, { abortController })
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
