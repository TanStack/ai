import { createFileRoute } from '@tanstack/react-router'
import {
  generateTranscription,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { createOpenaiTranscription } from '@tanstack/ai-openai'
import type { Provider } from '@/lib/types'

const LLMOCK_URL = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

function createTranscriptionAdapter(provider: Provider) {
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiTranscription('whisper-1', DUMMY_KEY, {
        baseURL: LLMOCK_URL,
      }),
  }
  return factories[provider]?.()
}

export const Route = createFileRoute('/api/transcription')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body = await request.json()
        const { audio, provider } = body

        const adapter = createTranscriptionAdapter(provider)
        if (!adapter) {
          return new Response(
            JSON.stringify({
              error: 'Provider does not support transcription',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        try {
          const stream = generateTranscription({
            adapter,
            audio,
            stream: true,
          })
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
