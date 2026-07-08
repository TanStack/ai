import { createFileRoute } from '@tanstack/react-router'
import {
  createVideoOptions,
  generateVideo,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { MediaPrompt } from '@tanstack/ai'
import type { Provider } from '@/lib/types'
import { createVideoAdapter } from '@/lib/media-providers'

export const Route = createFileRoute('/api/video')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.forwardedProps ?? body.data ?? body
        const { prompt, provider, testId, aimockPort } = data as {
          prompt: MediaPrompt
          provider: Provider
          testId?: string
          aimockPort?: number
        }

        const adapter = createVideoAdapter(provider, aimockPort, testId)

        try {
          const stream = generateVideo<typeof adapter, true>(
            createVideoOptions({
              adapter,
              prompt,
              stream: true,
              pollingInterval: 500,
            }),
          )
          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Video generation failed'
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
