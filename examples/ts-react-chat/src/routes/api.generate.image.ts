import { createFileRoute } from '@tanstack/react-router'
import { generateImage, toServerSentEventsResponse } from '@tanstack/ai'
import { grokImage } from '@tanstack/ai-grok'

export const Route = createFileRoute('/api/generate/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, size, model, numberOfImages } = body.data

        const stream = generateImage({
          adapter: grokImage(model ?? 'grok-imagine-image'),
          prompt,
          size,
          numberOfImages,
          stream: true,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
