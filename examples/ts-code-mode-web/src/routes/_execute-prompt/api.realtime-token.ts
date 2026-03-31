import { createFileRoute } from '@tanstack/react-router'
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'

export const Route = createFileRoute(
  '/_execute-prompt/api/realtime-token' as any,
)({
  server: {
    handlers: {
      POST: async () => {
        try {
          const token = await realtimeToken({
            adapter: openaiRealtimeToken({
              model: 'gpt-4o-realtime-preview',
            }),
          })
          return new Response(JSON.stringify(token), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: unknown) {
          console.error('[API realtime-token]', error)
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to create realtime token',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
