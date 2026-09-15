import { createFileRoute } from '@tanstack/react-router'
import { generateWorld } from '@tanstack/ai'
import { reactorWorld } from '@tanstack/ai-reactor'

const EXPIRES_AT = 1_800_000_000

function tokenFetch(
  body: unknown,
  status = 200,
  statusText = 'OK',
): typeof fetch {
  return async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      statusText,
      headers: { 'Content-Type': 'application/json' },
    })
}

export const Route = createFileRoute('/api/world')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          prompt?: unknown
          fail?: unknown
        }
        if (
          typeof body.prompt !== 'string' ||
          body.prompt.trim().length === 0
        ) {
          return Response.json(
            { ok: false, error: 'Prompt is required' },
            { status: 400 },
          )
        }

        const fetchImpl =
          body.fail === true
            ? tokenFetch('no credits', 402, 'Payment Required')
            : tokenFetch({ jwt: 'jwt-e2e', expires_at: EXPIRES_AT })

        try {
          const result = await generateWorld({
            adapter: reactorWorld('visko-orbis-stable', {
              apiKey: 'rk_e2e',
              fetch: fetchImpl,
            }),
            prompt: body.prompt.trim(),
            debug: false,
          })
          return Response.json({
            ok: true,
            token: result.token,
            model: result.model,
            prompt: result.prompt,
            status: result.status,
            expiresAt: result.expiresAt,
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
