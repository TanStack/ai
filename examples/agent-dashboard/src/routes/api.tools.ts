import { createFileRoute } from '@tanstack/react-router'
import { capabilitiesOf } from '@tanstack/ai-harness'
import { getHarnessForThread } from '@/server/harness'
import '@/server/meta'

// The tool registry for a thread's harness: only `public` tools are listed, so
// visibility is enforced at read time, not just hidden in the UI.
export const Route = createFileRoute('/api/tools')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const threadId = new URL(request.url).searchParams.get('threadId') ?? ''
        const harness = getHarnessForThread(threadId)
        const items = (
          capabilitiesOf(harness).tools.items as Array<{
            name: string
            description: string
            visibility?: string
          }>
        ).filter((tool) => tool.visibility === 'public')
        return Response.json({ tools: items })
      },
    },
  },
})
