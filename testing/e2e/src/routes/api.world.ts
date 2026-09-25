import { createFileRoute } from '@tanstack/react-router'
import { generateWorld } from '@tanstack/ai'
import { reactorWorld } from '@tanstack/ai-reactor'
import { worldlabsWorld } from '@tanstack/ai-worldlabs'

const EXPIRES_AT = 1_800_000_000
const WORLD_ID = 'world-e2e'
const OPERATION_ID = 'op-e2e'
const MARBLE_URL = `https://marble.worldlabs.ai/world/${WORLD_ID}`

function jsonResponse(
  body: unknown,
  status = 200,
  statusText = 'OK',
): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonFetch(
  body: unknown,
  status = 200,
  statusText = 'OK',
): typeof fetch {
  return async () => jsonResponse(body, status, statusText)
}

function worldLabsFetch(fail: boolean): typeof fetch {
  if (fail) {
    return jsonFetch({ detail: 'no credits' }, 402, 'Payment Required')
  }
  return async (input: RequestInfo | URL) => {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const url = decodeURIComponent(raw)
    if (url.includes('/marble/v1/worlds:generate')) {
      return jsonResponse({
        operation_id: OPERATION_ID,
        done: true,
        response: {
          world_id: WORLD_ID,
          display_name: 'E2E World',
          world_marble_url: MARBLE_URL,
          model: 'marble-1.1',
        },
      })
    }
    return jsonResponse({ detail: `unexpected url ${url}` }, 500)
  }
}

export const Route = createFileRoute('/api/world')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          prompt?: unknown
          fail?: unknown
          provider?: unknown
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

        const fail = body.fail === true
        const prompt = body.prompt.trim()

        try {
          if (body.provider === 'worldlabs') {
            const result = await generateWorld({
              adapter: worldlabsWorld('marble-1.1', {
                apiKey: 'wlt_e2e',
                fetch: worldLabsFetch(fail),
              }),
              prompt,
              debug: false,
            })
            return Response.json({
              ok: true,
              url: result.url,
              worldId: result.worldId,
              operationId: result.operationId,
              model: result.model,
              prompt: result.prompt,
              status: result.status,
            })
          }

          const fetchImpl = fail
            ? jsonFetch('no credits', 402, 'Payment Required')
            : jsonFetch({ jwt: 'jwt-e2e', expires_at: EXPIRES_AT })

          const result = await generateWorld({
            adapter: reactorWorld('visko-orbis-stable', {
              apiKey: 'rk_e2e',
              fetch: fetchImpl,
            }),
            prompt,
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
