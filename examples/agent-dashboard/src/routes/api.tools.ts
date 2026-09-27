import { createFileRoute } from '@tanstack/react-router'
import { capabilitiesOf } from '@tanstack/ai-harness'
import { getHarnessForThread, harnessRegistry } from '@/server/harness'
import { POD_TOOL_NAMES } from '@/server/systools'
import '@/server/meta'

// The run-now registry for a thread's harness: only `public` tools are listed, so
// visibility is enforced at read time, not just hidden in the UI. The `pod.*`
// system tools are public but excluded here — they're plumbing invoked by agents
// and dispatch, not scheduled automations the operator runs by hand.
export const Route = createFileRoute('/api/tools')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const params = new URL(request.url).searchParams
        const threadId = params.get('threadId') ?? ''
        const harnessName = params.get('harness')
        // Prefer the explicit harness (the thread may not be noted yet); fall
        // back to the thread's recorded harness.
        const harness =
          (harnessName && harnessRegistry[harnessName]) ||
          getHarnessForThread(threadId)
        const items = (
          capabilitiesOf(harness).tools.items as Array<{
            name: string
            description: string
            visibility?: string
          }>
        ).filter(
          (tool) =>
            tool.visibility === 'public' && !POD_TOOL_NAMES.has(tool.name),
        )
        return Response.json({ tools: items })
      },
    },
  },
})
