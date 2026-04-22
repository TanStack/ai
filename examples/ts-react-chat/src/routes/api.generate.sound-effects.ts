import { createFileRoute } from '@tanstack/react-router'
import { generateSoundEffects } from '@tanstack/ai'
import { buildSoundEffectsAdapter } from '../lib/server-audio-adapters'
import type { SoundEffectsProviderId } from '../lib/audio-providers'

export const Route = createFileRoute('/api/generate/sound-effects')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, duration, provider, model } = body.data as {
          prompt: string
          duration?: number
          provider?: SoundEffectsProviderId
          model?: string
        }

        const adapter = buildSoundEffectsAdapter(
          provider ?? 'fal-sound-effects',
          model,
        )

        try {
          const result = await generateSoundEffects({
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
