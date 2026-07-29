import { createFileRoute } from '@tanstack/react-router'
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { grokVideo } from '@tanstack/ai-grok'

export const Route = createFileRoute('/api/generate/video')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, size, duration, model } = body.data

        const stream = generateVideo({
          adapter: grokVideo(model ?? 'grok-imagine-video'),
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
