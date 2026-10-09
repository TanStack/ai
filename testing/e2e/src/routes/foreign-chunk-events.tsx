import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

/**
 * Client half of the issue #1531 harness. `/api/foreign-chunk-events` sends
 * only TEXT_MESSAGE_CHUNK, TOOL_CALL_CHUNK and REASONING_MESSAGE_CHUNK. The
 * page renders what useChat built from them.
 */
export const Route = createFileRoute('/foreign-chunk-events')({
  component: ForeignChunkEventsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    case: typeof search.case === 'string' ? search.case : 'turn',
  }),
})

function ForeignChunkEventsPage() {
  const search = Route.useSearch()
  const { messages, sendMessage } = useChat({
    connection: fetchServerSentEvents(
      `/api/foreign-chunk-events?case=${search.case}`,
    ),
  })

  useEffect(() => {
    void sendMessage('go')
    // Fire the single run once on mount; the harness route ignores the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const assistant = messages.filter((message) => message.role === 'assistant')

  return (
    <div data-testid="foreign-chunk-events-page">
      <div data-testid="assistant-ids">
        {assistant.map((message) => message.id).join(',')}
      </div>
      {assistant.map((message) => (
        <div key={message.id} data-testid={`message-${message.id}`}>
          <div data-testid="metadata">
            {JSON.stringify(message.metadata ?? {})}
          </div>
          {message.parts.map((part, index) => {
            if (part.type === 'text') {
              return (
                <div key={index} data-testid="text">
                  {part.content}
                </div>
              )
            }
            if (part.type === 'thinking') {
              return (
                <div key={index} data-testid="thinking">
                  {part.content}
                </div>
              )
            }
            if (part.type === 'tool-call') {
              return (
                <div key={index} data-testid={`tool-call-${part.name}`}>
                  {`${part.arguments} -> ${JSON.stringify(part.output)}`}
                </div>
              )
            }
            return null
          })}
        </div>
      ))}
    </div>
  )
}
