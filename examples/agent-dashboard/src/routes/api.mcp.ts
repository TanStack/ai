import { createFileRoute } from '@tanstack/react-router'
import { dashboardMcp } from '@/server/mcp'

const handle = ({ request }: { request: Request }) => {
  // ponytail: this local single-user demo has no auth. Add a bearer-token gate
  // before exposing the endpoint beyond localhost.
  return dashboardMcp.fetch(request)
}

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      DELETE: handle,
    },
  },
})
