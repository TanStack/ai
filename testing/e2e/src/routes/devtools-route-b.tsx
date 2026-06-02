import { Link, createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { DevtoolsHarness } from '@/components/DevtoolsHarness'
import { parseDevtoolsRouteSearch } from '@/lib/devtools-test'

export const Route = createFileRoute('/devtools-route-b')({
  component: DevtoolsRouteB,
  validateSearch: parseDevtoolsRouteSearch,
})

function DevtoolsRouteB() {
  const search = Route.useSearch()
  const routeBChat = useChat({
    id: 'devtools-route-b:chat',
    connection: fetchServerSentEvents('/api/chat'),
    body: {
      provider: 'openai',
      feature: 'chat',
      testId: search.testId,
      aimockPort: search.aimockPort,
    },
    devtools: { name: 'Route B Chat' },
  })

  return (
    <DevtoolsHarness>
      <section className="space-y-3 rounded border border-gray-800 bg-gray-900/40 p-4">
        <div
          data-testid="route-name"
          className="text-sm font-semibold text-orange-300"
        >
          Route B
        </div>
        <div
          data-testid="route-b-chat-status"
          className="text-xs text-gray-400"
        >
          {routeBChat.status}
        </div>
        <Link
          to="/devtools-route-a"
          search={search}
          data-testid="route-a-link"
          className="inline-flex rounded bg-orange-500 px-3 py-2 text-sm font-medium text-white"
        >
          Go to Route A
        </Link>
      </section>
    </DevtoolsHarness>
  )
}
