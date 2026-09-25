import { createFileRoute } from '@tanstack/react-router'
import { generateLiveVideo } from '@tanstack/ai'
import { falLiveVideo, isFalLiveVideoModel } from '@tanstack/ai-fal'
import { reactorVideo } from '@tanstack/ai-reactor'

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

export const Route = createFileRoute('/api/video-live')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          prompt?: unknown
          model?: unknown
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

        const model = typeof body.model === 'string' ? body.model : 'helios'
        const fail = body.fail === true
        const prompt = body.prompt.trim()

        try {
          const result = isFalLiveVideoModel(model)
            ? await generateLiveVideo({
                adapter: falLiveVideo(model, {
                  apiKey: 'fal_e2e',
                  fetch: fail
                    ? tokenFetch('no credits', 402, 'Payment Required')
                    : tokenFetch({ token: 'jwt-fal-e2e' }),
                }),
                prompt,
                debug: false,
              })
            : await generateLiveVideo({
                adapter: reactorVideo('helios', {
                  apiKey: 'rk_e2e',
                  fetch: fail
                    ? tokenFetch('no credits', 402, 'Payment Required')
                    : tokenFetch({ jwt: 'jwt-e2e', expires_at: EXPIRES_AT }),
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
