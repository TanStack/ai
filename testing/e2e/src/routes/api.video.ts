import { createFileRoute } from '@tanstack/react-router'
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { createVideoAdapter } from '@/lib/media-providers'
import type { MediaPrompt } from '@tanstack/ai'
import type { Feature, Provider } from '@/lib/types'

export const Route = createFileRoute('/api/video')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.forwardedProps ?? body.data ?? body
        const { prompt, provider, testId, aimockPort, feature, previousJobId } =
          data as {
            prompt: MediaPrompt
            provider: Provider
            testId?: string
            aimockPort?: number
            feature?: Feature
            previousJobId?: string
          }

        const adapter = createVideoAdapter(
          provider,
          aimockPort,
          testId,
          feature,
        )

        try {
          const stream = generateVideo({
            adapter,
            prompt,
            stream: true,
            pollingInterval: 500,
            ...(previousJobId ? { previousJobId } : {}),
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
