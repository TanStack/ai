import { createFileRoute } from '@tanstack/react-router'
import { typedServer } from '@/lib/mcp-typed-server'

export const Route = createFileRoute('/api/mcp-typed-server')({
  server: {
    handlers: {
      GET: ({ request }) => typedServer.fetch(request),
      POST: ({ request }) => typedServer.fetch(request),
      DELETE: ({ request }) => typedServer.fetch(request),
    },
  },
})
