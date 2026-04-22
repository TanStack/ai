import { createFileRoute } from '@tanstack/react-router'
import { generateMusic } from '@tanstack/ai'
import { buildMusicAdapter } from '../lib/server-audio-adapters'
import type { MusicProviderId } from '../lib/audio-providers'

export const Route = createFileRoute('/api/generate/music')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, duration, provider, model } = body.data as {
          prompt: string
          duration?: number
          provider?: MusicProviderId
          model?: string
        }

        const adapter = buildMusicAdapter(provider ?? 'gemini-lyria', model)

        try {
          const result = await generateMusic({
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
