import { createFileRoute } from '@tanstack/react-router'
import {
  createImageOptions,
  generateImage,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import type { MediaPrompt } from '@tanstack/ai'
import type { Provider } from '@/lib/types'
import { createImageAdapter } from '@/lib/media-providers'

export const Route = createFileRoute('/api/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.forwardedProps ?? body.data ?? body
        const { prompt, provider, numberOfImages, testId, aimockPort } =
          data as {
            prompt: MediaPrompt
            provider: Provider
            numberOfImages?: number
            testId?: string
            aimockPort?: number
          }

        const adapter = createImageAdapter(provider, aimockPort, testId)

        try {
          const stream = generateImage<typeof adapter, true>(
            createImageOptions({
              adapter,
              prompt,
              numberOfImages: numberOfImages ?? 1,
              stream: true,
            }),
          )
          return toServerSentEventsResponse(stream, { abortController })
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Image generation failed'
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
