import { createFileRoute } from '@tanstack/react-router'
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'
import { elevenlabsRealtimeToken } from '@tanstack/ai-elevenlabs'

type Provider = 'openai' | 'elevenlabs'

export const Route = createFileRoute('/api/realtime-token')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json()
          const provider: Provider = body.provider || 'openai'

          let token

          if (provider === 'openai') {
            token = await realtimeToken({
              adapter: openaiRealtimeToken({
                model: 'gpt-4o-realtime-preview',
              }),
            })
          } else if (provider === 'elevenlabs') {
            const agentId = body.agentId || process.env.ELEVENLABS_AGENT_ID

            if (!agentId) {
              return new Response(
                JSON.stringify({
                  error:
                    'ElevenLabs agent ID is required. Set ELEVENLABS_AGENT_ID or pass agentId in request body.',
                }),
                {
                  status: 400,
                  headers: { 'Content-Type': 'application/json' },
                },
              )
            }

            token = await realtimeToken({
              adapter: elevenlabsRealtimeToken({
                agentId,
              }),
            })
          } else {
            return new Response(
              JSON.stringify({ error: `Unknown provider: ${provider}` }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          return new Response(JSON.stringify(token), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: any) {
          console.error('[Realtime Token API] Error:', error)
          return new Response(
            JSON.stringify({
              error: error.message || 'Failed to generate realtime token',
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
