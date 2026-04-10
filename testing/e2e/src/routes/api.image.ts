import { createFileRoute } from '@tanstack/react-router'
import { generateImage, toServerSentEventsResponse } from '@tanstack/ai'
import { createOpenaiImage } from '@tanstack/ai-openai'
import { createGeminiImage } from '@tanstack/ai-gemini'
import { createGrokImage } from '@tanstack/ai-grok'
import type { Provider } from '@/lib/types'

const LLMOCK_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const LLMOCK_OPENAI = `${LLMOCK_BASE}/v1`
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

function createImageAdapter(provider: Provider) {
  const factories: Record<string, () => any> = {
    openai: () =>
      createOpenaiImage('gpt-image-1', DUMMY_KEY, { baseURL: LLMOCK_OPENAI }),
    gemini: () =>
      createGeminiImage('gemini-2.0-flash', DUMMY_KEY, {
        httpOptions: { baseUrl: LLMOCK_BASE },
      }),
    grok: () =>
      createGrokImage('grok-2-image', DUMMY_KEY, { baseURL: LLMOCK_OPENAI }),
  }
  return factories[provider]?.()
}

export const Route = createFileRoute('/api/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body = await request.json()
        const { prompt, provider } = body

        const adapter = createImageAdapter(provider)
        if (!adapter) {
          return new Response(
            JSON.stringify({
              error: 'Provider does not support image generation',
            }),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }

        try {
          const stream = generateImage({ adapter, prompt, stream: true })
          return toServerSentEventsResponse(stream)
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
