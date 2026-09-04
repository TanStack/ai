import { createFileRoute } from '@tanstack/react-router'
import { generateLive, type LiveAdapter } from '@tanstack/ai'

/**
 * Drives `generateLive()` against an in-process mock so the token result
 * shape is covered without a live provider connection.
 */
function mockLiveAdapter(): LiveAdapter {
  return {
    kind: 'live',
    name: 'mock-live',
    model: 'helios',
    '~types': { providerOptions: {} },
    createLive: async (options) => ({
      id: 'live-e2e',
      model: 'reactor/helios',
      token: 'jwt-e2e',
      expiresAt: Date.now() + 60_000,
      prompt: options.prompt,
      status: 'ready',
    }),
  }
}

export const Route = createFileRoute('/api/video-live')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { prompt?: unknown }
        const prompt =
          typeof body.prompt === 'string' ? body.prompt : 'a default scene'

        try {
          const result = await generateLive({
            adapter: mockLiveAdapter(),
            prompt,
            debug: false,
          })
          return Response.json({
            ok: true,
            model: result.model,
            prompt: result.prompt,
            status: result.status,
            hasToken: result.token.length > 0,
          })
        } catch (error) {
          return Response.json(
            {
              ok: false,
              error: error instanceof Error ? error.message : 'unknown',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
