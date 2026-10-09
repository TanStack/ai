import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'
// Fake credentials. aimock accepts any value.
const DUMMY_TOKEN = 'e2e-dummy-bearer-token'
const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

const credentials = {
  'api-key': { credential: DUMMY_KEY, auth: 'api-key' },
  bearer: { credential: DUMMY_TOKEN, auth: 'bearer' },
  oauth: { credential: DUMMY_TOKEN, auth: 'oauth' },
} as const

/**
 * Streams one Anthropic chat against the aimock fixture in
 * `fixtures/anthropic-auth`. A `fetch` wrapper records the headers and the
 * `system` field that the SDK puts on the wire, then sends the request on to
 * aimock. `?mode=` picks the credential and its `auth` kind.
 */
export const Route = createFileRoute('/api/anthropic-auth-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mode = new URL(request.url).searchParams.get('mode')
        if (mode !== 'api-key' && mode !== 'bearer' && mode !== 'oauth') {
          return Response.json({ ok: false, error: `Unknown mode: ${mode}` })
        }

        let wire: Record<string, unknown> | undefined
        const { credential, auth } = credentials[mode]
        const adapter = createAnthropicChat('claude-haiku-4-5', credential, {
          auth,
          baseURL: LLMOCK_DEFAULT_BASE,
          fetch: async (input, init) => {
            const outgoing = new Request(input, init)
            const body: unknown = await outgoing.clone().json()
            wire = {
              authorization: outgoing.headers.get('authorization'),
              xApiKey: outgoing.headers.get('x-api-key'),
              anthropicBeta: outgoing.headers.get('anthropic-beta'),
              xApp: outgoing.headers.get('x-app'),
              system:
                typeof body === 'object' && body !== null && 'system' in body
                  ? body.system
                  : undefined,
            }
            return fetch(outgoing)
          },
        })

        let text = ''
        try {
          for await (const chunk of chat({
            adapter,
            messages: [{ role: 'user', content: '[anthropic-auth] say hello' }],
          })) {
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
            if (chunk.type === 'RUN_ERROR') {
              return Response.json({ ok: false, error: chunk.message, wire })
            }
          }
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return Response.json({ ok: true, text, wire })
      },
    },
  },
})
