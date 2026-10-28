import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'
import { parseAimockPort } from '@/lib/devtools-test'
import {
  SUBAGENT_PROMPTS,
  deleteLogs,
  isSubagentScenario,
  SUBAGENT_E2E_KEY,
} from '@/lib/subagents-test'

const clientTools = [deleteLogs.client()] as const

/** One short line per child part, so a spec can read the card as text. */
function describeParts(messages: ReadonlyArray<UIMessage>): Array<string> {
  return messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      if (part.type === 'text') return [`text:${part.content}`]
      if (part.type === 'thinking') return [`thinking:${part.content}`]
      if (part.type === 'tool-call') return [`tool:${part.name}:${part.state}`]
      if (part.type === 'tool-result') return [`result:${part.toolCallId}`]
      return [part.type]
    }),
  )
}

function SubagentsTestPage() {
  const { testId, aimockPort, scenario } = Route.useSearch()
  const { messages, sendMessage, interrupts, isLoading } = useChat({
    threadId: `subagents-${testId ?? 'manual'}-${scenario}`,
    // The `keys` scenario sends the user's key the way a BYOK store does.
    connection: fetchServerSentEvents(
      '/api/subagents-test',
      scenario === 'keys'
        ? { headers: { 'x-byok-openai': SUBAGENT_E2E_KEY } }
        : {},
    ),
    forwardedProps: { scenario, testId, aimockPort },
    tools: clientTools,
  })

  const assistant = messages.filter((message) => message.role === 'assistant')
  const parentParts = assistant.flatMap((message) =>
    message.parts.map((part) => part.type),
  )
  const parentText = assistant
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'text' ? [part.content] : [],
      ),
    )
    .join(' ')
  const cards = assistant.flatMap((message) =>
    message.parts.flatMap((part) =>
      part.type === 'subagent' ? [part.subagent] : [],
    ),
  )

  return (
    <div data-testid="subagents-page">
      <button
        data-testid="run"
        onClick={() => void sendMessage(SUBAGENT_PROMPTS[scenario])}
      >
        Run
      </button>
      <div data-testid="loading">{String(isLoading)}</div>
      <div data-testid="message-count">{messages.length}</div>
      <div data-testid="parent-part-types">{parentParts.join(',')}</div>
      <div data-testid="parent-text">{parentText}</div>
      {cards.map((card) => (
        <section key={card.id} data-testid={`card-${card.name}`}>
          <span data-testid={`card-status-${card.name}`}>{card.status}</span>
          <span data-testid={`card-input-${card.name}`}>
            {card.input === undefined ? '' : JSON.stringify(card.input)}
          </span>
          <ul>
            {describeParts(card.messages).map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
      {interrupts.map((interrupt) =>
        interrupt.kind === 'tool-approval' ? (
          <button
            key={interrupt.id}
            data-testid={`approve-${interrupt.toolName}`}
            onClick={() => interrupt.resolveInterrupt(true)}
          >
            Approve {interrupt.toolName}
          </button>
        ) : null,
      )}
    </div>
  )
}

export const Route = createFileRoute('/subagents-test')({
  component: SubagentsTestPage,
  validateSearch: (search: Record<string, unknown>) => ({
    testId: typeof search.testId === 'string' ? search.testId : undefined,
    aimockPort: parseAimockPort(search.aimockPort),
    scenario: isSubagentScenario(search.scenario) ? search.scenario : 'route',
  }),
})
