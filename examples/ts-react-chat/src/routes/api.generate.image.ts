import { createFileRoute } from '@tanstack/react-router'
import {
  createImageOptions,
  generateImage,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

export const Route = createFileRoute('/api/generate/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, size, model, numberOfImages } = body.data

        const adapter = openaiImage(model ?? 'gpt-image-1')
        const stream = generateImage<typeof adapter, true>(
          createImageOptions({
            adapter,
            prompt,
            size,
            numberOfImages,
            stream: true,
          }),
        )

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
