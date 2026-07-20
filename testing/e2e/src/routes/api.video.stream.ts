import { createFileRoute } from '@tanstack/react-router'
import { createVideoOptions, generateVideo, toHttpResponse } from '@tanstack/ai'
import type { MediaPrompt } from '@tanstack/ai'
import type { Feature, Provider } from '@/lib/types'
import { createVideoAdapter } from '@/lib/media-providers'

export const Route = createFileRoute('/api/video/stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.forwardedProps ?? body.data ?? body
        const { prompt, provider, testId, aimockPort, feature } = data as {
          prompt: MediaPrompt
          provider: Provider
          testId?: string
          aimockPort?: number
          feature?: Feature
        }

        const adapter = createVideoAdapter(
          provider,
          aimockPort,
          testId,
          feature,
        )

        try {
          const stream = generateVideo<typeof adapter, true>(
            createVideoOptions({
              adapter,
              prompt,
              stream: true,
              pollingInterval: 500,
            }),
          )
          return toHttpResponse(stream, { abortController })
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
