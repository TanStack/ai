import { createFileRoute } from '@tanstack/react-router'
import { generateAudio } from '@tanstack/ai'
import { createAudioAdapter } from '@/lib/media-providers'
import type { Feature, Provider } from '@/lib/types'

export const Route = createFileRoute('/api/audio')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body = await request.json()
        const data = body.data ?? body
        const { prompt, duration, provider, testId, aimockPort, feature } =
          data as {
            prompt: string
            duration?: number
            provider: Provider
            testId?: string
            aimockPort?: number
            feature?: Feature
          }

        const adapter = createAudioAdapter(
          provider,
          aimockPort,
          testId,
          feature,
        )

        try {
          const result = await generateAudio({ adapter, prompt, duration })
          return new Response(JSON.stringify({ result }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
