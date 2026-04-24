import { createFileRoute } from '@tanstack/react-router'
import { generateImage, toHttpResponse } from '@tanstack/ai'
import { createImageAdapter } from '@/lib/media-providers'
import type { Provider } from '@/lib/types'

export const Route = createFileRoute('/api/image/stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.data ?? body
        const { prompt, provider, numberOfImages, testId, aimockPort } =
          data as {
            prompt: string
            provider: Provider
            numberOfImages?: number
            testId?: string
            aimockPort?: number
          }

        const adapter = createImageAdapter(provider, aimockPort, testId)

        try {
          const stream = generateImage({
            adapter,
            prompt,
            numberOfImages: numberOfImages ?? 1,
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
