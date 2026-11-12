import { createFileRoute } from '@tanstack/react-router'
import { handler } from '@/harness'

// The harness answers every path under /api/harness, like /api/harness/run.
export const Route = createFileRoute('/api/harness/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
})
