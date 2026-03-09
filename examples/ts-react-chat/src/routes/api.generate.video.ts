import { createFileRoute } from '@tanstack/react-router'
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

export const Route = createFileRoute('/api/generate/video')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, size, duration, model } = body.data

        const stream = generateVideo({
          adapter: openaiVideo(model ?? 'sora-2'),
          prompt,
          size,
          duration,
          stream: true,
          pollingInterval: 3000,
          maxDuration: 600_000,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
