import { createFileRoute } from '@tanstack/react-router'
import { generateMusic } from '@tanstack/ai'
import { createMusicAdapter } from '@/lib/media-providers'
import type { Provider } from '@/lib/types'

export const Route = createFileRoute('/api/music')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body = await request.json()
        const data = body.data ?? body
        const { prompt, duration, provider, testId, aimockPort } = data as {
          prompt: string
          duration?: number
          provider: Provider
          testId?: string
          aimockPort?: number
        }

        const adapter = createMusicAdapter(provider, aimockPort, testId)

        try {
          const result = await generateMusic({ adapter, prompt, duration })
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
