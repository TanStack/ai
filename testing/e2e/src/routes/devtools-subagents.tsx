import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { DevtoolsHarness } from '@/components/DevtoolsHarness'
import { parseDevtoolsRouteSearch } from '@/lib/devtools-test'
import { SUBAGENT_PROMPTS } from '@/lib/subagents-test'

/**
 * The `route` subagent scenario with the AI devtools panel. The researcher
 * child thinks, calls `lookupFacts`, then answers. The panel must show that
 * work the same way it shows the root agent's work.
 */
function DevtoolsSubagentsRoute() {
  const { testId, aimockPort } = Route.useSearch()
  const chat = useChat({
    threadId: `devtools-subagents-${testId ?? 'manual'}`,
    connection: fetchServerSentEvents('/api/subagents-test'),
    body: { scenario: 'route', testId, aimockPort },
    devtools: { name: 'Blog Desk' },
  })
  const cards = chat.messages.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === 'subagent' ? [part.subagent] : [],
    ),
  )

  return (
    <DevtoolsHarness>
      <button
        type="button"
        data-testid="run"
        onClick={() => void chat.sendMessage(SUBAGENT_PROMPTS.route)}
      >
        Run
      </button>
      <div data-testid="message-count">{chat.messages.length}</div>
      {cards.map((card) => (
        <span key={card.id} data-testid={`card-status-${card.name}`}>
          {card.status}
        </span>
      ))}
    </DevtoolsHarness>
  )
}

export const Route = createFileRoute('/devtools-subagents')({
  component: DevtoolsSubagentsRoute,
  validateSearch: parseDevtoolsRouteSearch,
})
