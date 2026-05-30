import { Link, createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { DevtoolsHarness } from '@/components/DevtoolsHarness'
import {
  devtoolsRouteSearch,
  parseDevtoolsRouteSearch,
} from '@/lib/devtools-test'

export const Route = createFileRoute('/devtools-route-a')({
  component: DevtoolsRouteA,
  validateSearch: parseDevtoolsRouteSearch,
})

function DevtoolsRouteA() {
  const search = Route.useSearch()
  const routeAChat = useChat({
    id: 'devtools-route-a:chat',
    connection: fetchServerSentEvents('/api/chat'),
    body: {
      provider: 'openai',
      feature: 'chat',
      testId: search.testId,
      aimockPort: search.aimockPort,
    },
    devtools: { name: 'Route A Chat' },
  })
  const routeAAux = useChat({
    id: 'devtools-route-a:auxiliary',
    connection: fetchServerSentEvents('/api/chat'),
    body: {
      provider: 'openai',
      feature: 'chat',
      testId: search.testId,
      aimockPort: search.aimockPort,
    },
    devtools: { name: 'Route A Aux' },
  })

  return (
    <DevtoolsHarness>
      <section className="space-y-3 rounded border border-gray-800 bg-gray-900/40 p-4">
        <div
          data-testid="route-name"
          className="text-sm font-semibold text-orange-300"
        >
          Route A
        </div>
        <div
          data-testid="route-a-chat-status"
          className="text-xs text-gray-400"
        >
          {routeAChat.status}
        </div>
        <div data-testid="route-a-aux-status" className="text-xs text-gray-400">
          {routeAAux.status}
        </div>
        <Link
          to="/devtools-route-b"
          search={search}
          data-testid="route-b-link"
          className="inline-flex rounded bg-orange-500 px-3 py-2 text-sm font-medium text-white"
        >
          Go to Route B
        </Link>
        <a
          data-testid="generation-route-link"
          className="ml-2 inline-flex rounded border border-gray-700 px-3 py-2 text-sm text-gray-200"
          href={`/devtools-generation-hooks${devtoolsRouteSearch(search)}`}
        >
          Generation Hooks
        </a>
      </section>
    </DevtoolsHarness>
  )
}
