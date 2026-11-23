import { createFileRoute } from '@tanstack/react-router'
import { realtimeSession } from '@tanstack/ai'
import { openaiLiveSession } from '@tanstack/ai-openai'
import { LLMOCK_DEFAULT_BASE } from '@/lib/providers'

/**
 * Relays a GPT-Live WebRTC offer to the aimock `/v1/live/sessions` mount and
 * returns the SDP answer. The server instructions replace the client value.
 */
export const Route = createFileRoute('/api/live-session')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const answer = await realtimeSession({
            adapter: openaiLiveSession({
              baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
              apiKey: 'e2e',
              instructions: 'server wins',
              delegation: { model: 'gpt-5.5' },
            }),
            request: await request.json(),
            abortSignal: request.signal,
          })
          return Response.json(answer)
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 400 },
          )
        }
      },
    },
  },
})
