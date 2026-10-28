import { createFileRoute } from '@tanstack/react-router'
import { statelessServer, typedServer } from '@/lib/mcp-typed-server'

// `?stateless` serves the server without a spec 2025 session store.
function serve(request: Request) {
  if (new URL(request.url).searchParams.has('stateless')) {
    return statelessServer.handle(request, { context: { tenant: 'acme' } })
  }
  return typedServer.fetch(request)
}

export const Route = createFileRoute('/api/mcp-typed-server')({
  server: {
    handlers: {
      GET: ({ request }) => serve(request),
      POST: ({ request }) => serve(request),
      DELETE: ({ request }) => serve(request),
    },
  },
})
