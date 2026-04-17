import { createFileRoute } from '@tanstack/react-router'
import { generateAudio } from '@tanstack/ai'
import { buildAudioAdapter } from '../lib/server-audio-adapters'
import type { AudioProviderId } from '../lib/audio-providers'

export const Route = createFileRoute('/api/generate/audio')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, duration, provider } = body.data as {
          prompt: string
          duration?: number
          provider?: AudioProviderId
        }

        const adapter = buildAudioAdapter(provider ?? 'elevenlabs-music')

        try {
          const result = await generateAudio({
            adapter,
            prompt,
            duration,
          })
          return new Response(JSON.stringify({ result }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
