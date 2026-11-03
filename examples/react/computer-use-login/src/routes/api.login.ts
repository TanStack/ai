import { createFileRoute } from '@tanstack/react-router'
import { loginSchema, saveLogin } from '@/harness'

// The login card sends the username and password here, not to the harness.
// The harness logs every answer. This route keeps the login in memory until
// the requestLogin tool uses it, and logs nothing.
export const Route = createFileRoute('/api/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // A body that is not JSON fails the check below too.
        const body: unknown = await request.json().catch(() => undefined)
        const login = loginSchema.safeParse(body)
        if (!login.success) {
          return Response.json(
            { error: 'Send a thread id, a site, a username, and a password.' },
            { status: 400 },
          )
        }
        saveLogin(login.data)
        return new Response(null, { status: 204 })
      },
    },
  },
})
