import { createFileRoute } from '@tanstack/react-router'
import { generateAudio, toHttpResponse } from '@tanstack/ai'
import { createAudioAdapter } from '@/lib/media-providers'
import type { ElevenLabsAudioModel } from '@tanstack/ai-elevenlabs'
import type { Provider } from '@/lib/types'

export const Route = createFileRoute('/api/audio/stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.data ?? body
        const { prompt, model, duration, provider, testId, aimockPort } =
          data as {
            prompt: string
            model?: ElevenLabsAudioModel
            duration?: number
            provider: Provider
            testId?: string
            aimockPort?: number
          }

        const adapter = createAudioAdapter(provider, aimockPort, testId, model)

        try {
          const stream = generateAudio({
            adapter,
            prompt,
            ...(duration != null ? { duration } : {}),
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
