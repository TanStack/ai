import { createFileRoute } from '@tanstack/react-router'
import { generateAudio, toServerSentEventsResponse } from '@tanstack/ai'
import { buildAudioAdapter } from '../lib/server-audio-adapters'
import type { AudioProviderId } from '../lib/audio-providers'

export const Route = createFileRoute('/api/generate/audio')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, duration, provider, model } = body.data as {
          prompt: string
          duration?: number
          provider?: AudioProviderId
          model?: string
        }

        const adapter = buildAudioAdapter(provider ?? 'gemini-lyria', model)

        const stream = generateAudio({
          adapter,
          prompt,
          duration,
          stream: true,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
