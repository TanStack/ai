import { createFileRoute } from '@tanstack/react-router'
import { generateTranscription, toServerSentEventsResponse } from '@tanstack/ai'
import { buildTranscriptionAdapter } from '../lib/server-audio-adapters'
import type { TranscriptionProviderId } from '../lib/audio-providers'

export const Route = createFileRoute('/api/transcribe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { audio, language, provider } = body.data as {
          audio: string
          language?: string
          provider?: TranscriptionProviderId
        }

        const adapter = buildTranscriptionAdapter(provider ?? 'openai')

        const stream = generateTranscription({
          adapter,
          audio,
          language,
          stream: true,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
