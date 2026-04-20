import { createFileRoute } from '@tanstack/react-router'
import { generateTranscription, toHttpResponse } from '@tanstack/ai'
import { createTranscriptionAdapter } from '@/lib/media-providers'
import type { Provider } from '@/lib/types'

export const Route = createFileRoute('/api/transcription/stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.data ?? body
        const { audio, language, provider, testId, aimockPort } = data as {
          audio: string
          language?: string
          provider: Provider
          testId?: string
          aimockPort?: number
        }

        const adapter = createTranscriptionAdapter(provider, aimockPort, testId)

        try {
          const stream = generateTranscription({
            adapter,
            audio,
            language,
            stream: true,
          })
          return toHttpResponse(stream, { abortController })
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
