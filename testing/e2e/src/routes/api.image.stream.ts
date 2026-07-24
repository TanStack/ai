import { createFileRoute } from '@tanstack/react-router'
import { generateImage, toHttpResponse } from '@tanstack/ai'
import { createImageAdapter } from '@/lib/media-providers'
import type { MediaPrompt } from '@tanstack/ai'
import type { Provider } from '@/lib/types'

export const Route = createFileRoute('/api/image/stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const abortController = new AbortController()
        const body = await request.json()
        const data = body.forwardedProps ?? body.data ?? body
        const {
          prompt,
          provider,
          numberOfImages,
          testId,
          aimockPort,
          previousImage,
        } = data as {
          prompt: MediaPrompt
          provider: Provider
          numberOfImages?: number
          testId?: string
          aimockPort?: number
          previousImage?: { url?: string; b64Json?: string }
        }

        const adapter = createImageAdapter(provider, aimockPort, testId)
        // The wire shape is a loose optional pair; generateImage's previousImage
        // takes the strict GeneratedImage union, so narrow to one branch.
        const editImage =
          previousImage?.url != null
            ? { url: previousImage.url }
            : previousImage?.b64Json != null
              ? { b64Json: previousImage.b64Json }
              : undefined

        try {
          const stream = generateImage({
            adapter,
            prompt,
            numberOfImages: numberOfImages ?? 1,
            stream: true,
            ...(editImage ? { previousImage: editImage } : {}),
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
