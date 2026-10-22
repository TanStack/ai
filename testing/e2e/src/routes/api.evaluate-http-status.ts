import { createFileRoute } from '@tanstack/react-router'
import { boolean, decide } from '@tanstack/ai'
import { createTypesafeDecider } from '@tanstack/ai-typesafe'
import { createVercelGatewayDecider } from '@tanstack/ai-vercel-gateway'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
const DUMMY_KEY = 'sk-e2e-test-dummy-key'

const STATE = 'The checkout page has been down for an hour.'
const QUESTIONS = {
  isUrgent: boolean({ instructions: 'Does this message convey urgency?' }),
}

export const Route = createFileRoute('/api/evaluate-http-status')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = new URL(request.url).searchParams
        const provider = params.get('provider')
        const defaultHeaders = {
          'x-evaluate-http-status': params.get('status') ?? '',
        }

        try {
          if (provider === 'typesafe') {
            await decide({
              adapter: createTypesafeDecider('jev-latest', DUMMY_KEY, {
                baseURL: `${LLMOCK_DEFAULT_BASE}/evaluate-http-status`,
                defaultHeaders,
              }),
              state: STATE,
              questions: QUESTIONS,
            })
          } else if (provider === 'vercel-gateway') {
            await decide({
              adapter: createVercelGatewayDecider(
                'typesafe-ai/jev',
                DUMMY_KEY,
                {
                  baseURL: LLMOCK_DEFAULT_BASE,
                  defaultHeaders,
                },
              ),
              state: STATE,
              questions: QUESTIONS,
            })
          } else {
            return Response.json(
              { ok: false, error: { message: 'Unsupported provider' } },
              { status: 400 },
            )
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error:
              error instanceof Error
                ? {
                    name: error.name,
                    message: error.message,
                    status: 'status' in error ? error.status : undefined,
                  }
                : { message: String(error) },
          })
        }

        return Response.json({ ok: true })
      },
    },
  },
})
