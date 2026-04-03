import { createFileRoute } from '@tanstack/react-router'
import { generate } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import type { Provider } from '@/lib/types'

const LLMOCK_URL = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

function createTranscriptionAdapter(provider: Provider) {
  const factories: Record<string, () => any> = {
    openai: () => openaiTranscription({ baseURL: LLMOCK_URL }),
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
          return new Response(JSON.stringify({ error: 'Provider does not support transcription' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        try {
          const result = await generate({ adapter, audio })
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          })
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
