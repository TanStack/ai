import { createFileRoute } from '@tanstack/react-router'
import { openrouterSignIn } from '@tanstack/ai-openrouter/pkce'

// The sign-in URL that the last POST opened. The spec reads it with GET.
let authUrl: string | undefined

/**
 * Runs `openrouterSignIn` the way a CLI does. `open` keeps the sign-in URL,
 * and the spec plays the browser. The key exchange answers with a fake key,
 * so no request goes to OpenRouter.
 */
export const Route = createFileRoute('/api/openrouter-sign-in')({
  server: {
    handlers: {
      GET: () => Response.json({ authUrl }),
      POST: async () => {
        authUrl = undefined
        const signIn = openrouterSignIn({
          timeoutMs: 30_000,
          fetchImpl: async () => Response.json({ key: 'sk-or-v1-e2e' }),
        })
        const key = await signIn({
          open: (url) => {
            authUrl = url
          },
        })
        return Response.json({ key })
      },
    },
  },
})
