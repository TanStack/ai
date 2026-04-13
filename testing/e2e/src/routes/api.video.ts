import { createFileRoute } from '@tanstack/react-router'
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { createVideoAdapter } from '@/lib/media-providers'
import type { Provider } from '@/lib/types'

export const Route = createFileRoute('/api/video')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.data ?? body
        const { prompt, provider, testId, aimockPort } = data as {
          prompt: string
          provider: Provider
          testId?: string
          aimockPort?: number
        }

        const adapter = createVideoAdapter(provider, aimockPort, testId)

        try {
          const stream = generateVideo({
            adapter,
            prompt,
            stream: true,
            pollingInterval: 500,
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
