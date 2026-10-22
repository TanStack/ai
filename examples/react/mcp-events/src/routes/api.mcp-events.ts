import { createFileRoute } from '@tanstack/react-router'
import { handleWebhook } from '../lib/desk'

export const Route = createFileRoute('/api/mcp-events')({
  server: {
    handlers: {
      POST: ({ request }) => handleWebhook(request),
    },
  },
})
