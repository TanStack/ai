import { createFileRoute } from '@tanstack/react-router'
import { capabilitiesOf } from '@tanstack/ai-harness'
import { harnessFor } from '@/server/harness'
import { POD_TOOL_NAMES } from '@/server/systools'
import '@/server/meta'

// The run-now registry for a thread's harness: only the tools in `expose.tools`.
// The harness refuses any other tool too. The `pod.*` system tools are exposed
// but left out here: agents and dispatch run them, not the operator.
export const Route = createFileRoute('/api/tools')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const params = new URL(request.url).searchParams
        const threadId = params.get('threadId') ?? ''
        const harness = await harnessFor(threadId, params.get('harness'))
        const items = capabilitiesOf(harness).tools.items.filter(
          (tool) => tool.exposed && !POD_TOOL_NAMES.has(tool.name),
        )
        return Response.json({ tools: items })
      },
    },
  },
})
