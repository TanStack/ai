import { createFileRoute } from '@tanstack/react-router'
import { generateSpeech, toServerSentEventsResponse } from '@tanstack/ai'
import { buildSpeechAdapter } from '../lib/server-audio-adapters'
import type { SpeechProviderId } from '../lib/audio-providers'

export const Route = createFileRoute('/api/generate/speech')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { text, voice, format, provider } = body.data as {
          text: string
          voice?: string
          format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
          provider?: SpeechProviderId
        }

        const adapter = buildSpeechAdapter(provider ?? 'openai')

        const stream = generateSpeech({
          adapter,
          text,
          voice,
          format,
          stream: true,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
