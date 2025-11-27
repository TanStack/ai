import { createFileRoute } from '@tanstack/react-router'
import { chat, toStreamResponse, maxIterations } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

export const Route = createFileRoute('/api/tanchat')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const requestSignal = request.signal

        if (requestSignal?.aborted) {
          return new Response(null, { status: 499 })
        }

        const abortController = new AbortController()

        const { messages } = await request.json()
        try {
          const stream = chat({
            adapter: openai(),
            model: 'gpt-4o-mini',
            systemPrompts: [
              'You are a helpful assistant. Provide clear and concise answers.',
            ],
            agentLoopStrategy: maxIterations(20),
            messages,
            abortController,
          })

          return toStreamResponse(stream, { abortController })
        } catch (error: any) {
          console.error('[API Route] Error in chat request:', {
            message: error?.message,
            name: error?.name,
            status: error?.status,
            statusText: error?.statusText,
            code: error?.code,
            type: error?.type,
            stack: error?.stack,
            error: error,
          })
          if (error.name === 'AbortError' || abortController.signal.aborted) {
            return new Response(null, { status: 499 })
          }
          return new Response(
            JSON.stringify({
              error: error.message || 'An error occurred',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
