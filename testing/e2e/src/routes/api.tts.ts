import { createFileRoute } from '@tanstack/react-router'
import { generateSpeech, toServerSentEventsResponse } from '@tanstack/ai'
import { createTTSAdapter } from '@/lib/media-providers'
import type { TTSTurn } from '@tanstack/ai'
import type { Provider } from '@/lib/types'

export const Route = createFileRoute('/api/tts')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.forwardedProps ?? body.data ?? body
        const { text, turns, timestamps, voice, provider, testId, aimockPort } =
          data as {
            text?: string
            turns?: Array<TTSTurn>
            timestamps?: boolean
            voice?: string
            provider: Provider
            testId?: string
            aimockPort?: number
          }

        const adapter = createTTSAdapter(provider, aimockPort, testId)

        try {
          const stream = turns
            ? generateSpeech({ adapter, turns, timestamps, stream: true })
            : generateSpeech({
                adapter,
                text: text ?? '',
                voice,
                timestamps,
                stream: true,
              })
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
