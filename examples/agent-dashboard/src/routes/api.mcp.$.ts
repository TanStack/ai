import { createFileRoute } from '@tanstack/react-router'
import { createHarnessMcpServer } from '@tanstack/ai-mcp/harness'
import { getHost, harnessRegistry } from '@/server/harness'
import { dashboardMcp } from '@/server/mcp'
import '@/server/meta'

// `/api/mcp`: the dashboard tools (see `server/mcp.ts`).
// One MCP server per agent: `/api/mcp/<harness name>`, for example
// `/api/mcp/support/triage`. Its tools are `chat`, `steer`, `cancel`,
// `approve`, `reject`, `resolve`, `answer`, `status`, plus `tool_<name>` for
// each tool in `expose.tools`. Each call names its `threadId`.
const servers = new Map<string, ReturnType<typeof createHarnessMcpServer>>()

const handle = async ({ request }: { request: Request }) => {
  // ponytail: this local single-user demo has no auth. Add a bearer-token gate
  // before exposing the endpoint beyond localhost.
  const name = decodeURIComponent(
    new URL(request.url).pathname.replace(/^\/api\/mcp\/?/, ''),
  )
  if (!name) return dashboardMcp.fetch(request)
  const harness = harnessRegistry[name]
  if (!harness) {
    return Response.json({ error: `unknown harness: ${name}` }, { status: 404 })
  }
  let server = servers.get(name)
  if (!server) {
    server = createHarnessMcpServer({ host: getHost(), harness })
    servers.set(name, server)
  }
  return (await server).fetch(request)
}

export const Route = createFileRoute('/api/mcp/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
      DELETE: handle,
    },
  },
})
