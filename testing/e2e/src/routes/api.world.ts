import { createFileRoute } from '@tanstack/react-router'
import { generateWorld, type WorldAdapter } from '@tanstack/ai'

/**
 * Drives `generateWorld()` against an in-process mock adapter so the activity
 * wiring (options, result shape) is covered without a live Reactor session.
 */
function mockWorldAdapter(): WorldAdapter {
  return {
    kind: 'world',
    name: 'mock-world',
    model: 'visko-orbis-stable',
    '~types': { providerOptions: {} },
    createWorld: async (options) => ({
      id: 'world-e2e',
      model: 'reactor/visko-orbis-stable',
      token: 'jwt-e2e',
      expiresAt: Date.now() + 60_000,
      prompt: options.prompt,
      status: 'ready',
    }),
  }
}

export const Route = createFileRoute('/api/world')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { prompt?: unknown }
        const prompt =
          typeof body.prompt === 'string' ? body.prompt : 'a default world'

        try {
          const result = await generateWorld({
            adapter: mockWorldAdapter(),
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
