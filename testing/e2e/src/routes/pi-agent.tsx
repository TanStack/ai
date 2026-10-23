import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

// TanStack `useChat` talks to the pi agent in `api.pi-agent.ts`. `?prompt=`
// sets the first user message.
export const Route = createFileRoute('/pi-agent')({
  validateSearch: (search: Record<string, unknown>) => ({
    prompt: typeof search.prompt === 'string' ? search.prompt : undefined,
  }),
  component: PiAgentPage,
})

function PiAgentPage() {
  const { prompt = 'Weather in Oslo?' } = Route.useSearch()
  const { messages, sendMessage, interrupts } = useChat({
    threadId: 'pi-agent',
    connection: fetchServerSentEvents('/api/pi-agent'),
  })

  const parts = messages.flatMap((message) =>
    message.role === 'assistant' ? message.parts : [],
  )
  const assistantText = parts
    .flatMap((part) => (part.type === 'text' ? [part.content] : []))
    .join('')
  const toolResults = parts.flatMap((part) =>
    part.type === 'tool-result' ? [part.content] : [],
  )

  useEffect(() => {
    void sendMessage(prompt)
    // Send once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-testid="pi-agent-page">
      {interrupts.map((interrupt) =>
        interrupt.kind === 'generic' ? (
          <button
            key={interrupt.id}
            data-testid="approve-button"
            onClick={() => interrupt.resolveInterrupt({ approved: true })}
          >
            Approve
          </button>
        ) : null,
      )}
      <div data-testid="tool-results">{toolResults.join(',')}</div>
      <div data-testid="assistant-text">{assistantText}</div>
    </div>
  )
}
