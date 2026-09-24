import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatHook } from '@tanstack/ai-react/ui'
import type { SubagentPartsProps, SubagentProps } from '@tanstack/ai-react/ui'
import { parseAimockPort } from '@/lib/devtools-test'
import { SUBAGENT_PROMPTS, lookupFacts } from '@/lib/subagents-test'

/**
 * The chat UI kit on the `route` scenario. The root registers `thinking`,
 * `text`, and a `lookupFacts` tool widget. The researcher card overrides
 * `thinking` only, so its tool call and text still use the root widgets.
 */
const chatOptions = {
  connection: fetchServerSentEvents('/api/subagents-test'),
  subagents: [{ name: 'researcher', tools: [lookupFacts] }] as const,
}

const researcherParts: SubagentPartsProps<
  typeof chatOptions,
  'researcher'
>['partsComponents'] = {
  thinking: ({ part }) => <p data-testid="card-thinking">{part.content}</p>,
}

function Researcher({
  Parts,
}: SubagentProps<typeof chatOptions, 'researcher'>) {
  return (
    <section data-testid="card-researcher">
      <Parts partsComponents={researcherParts} />
    </section>
  )
}

const { useAppChat } = createChatHook({
  options: chatOptions,
  components: {
    layout: ({ Messages }) => <Messages />,
    message: ({ Parts }) => (
      <div>
        <Parts />
      </div>
    ),
  },
  partsComponents: {
    text: ({ part }) => <p data-testid="root-text">{part.content}</p>,
    thinking: ({ part }) => <p data-testid="root-thinking">{part.content}</p>,
    fallback: () => null,
  },
  toolsComponents: {
    lookupFacts: ({ part }) => (
      <p data-testid="root-tool">
        {part.name}:{part.state}
      </p>
    ),
  },
  subagentsComponents: { researcher: Researcher },
})

function SubagentsUITestPage() {
  const { testId, aimockPort } = Route.useSearch()
  const chat = useAppChat({
    threadId: `subagents-ui-${testId ?? 'manual'}`,
    body: { scenario: 'route', testId, aimockPort },
  })
  return (
    <div data-testid="subagents-ui-page">
      <button
        data-testid="run"
        onClick={() => void chat.sendMessage(SUBAGENT_PROMPTS.route)}
      >
        Run
      </button>
      <div data-testid="message-count">{chat.messages.length}</div>
      <chat.AppChat />
    </div>
  )
}

export const Route = createFileRoute('/subagents-ui-test')({
  component: SubagentsUITestPage,
  validateSearch: (search: Record<string, unknown>) => ({
    testId: typeof search.testId === 'string' ? search.testId : undefined,
    aimockPort: parseAimockPort(search.aimockPort),
  }),
})
