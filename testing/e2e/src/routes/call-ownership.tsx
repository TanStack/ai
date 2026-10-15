import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

/**
 * Harness for issue #1533. `/api/call-ownership-wire` streams three model
 * calls the way `chat()` publishes them: one `RUN_STARTED`, then a
 * `tool_calls` `RUN_FINISHED` between calls, with reasoning before each
 * call's text id. The page prints one assistant message per call.
 */
function partLabel(part: { type: string; content?: unknown }): string {
  if (
    (part.type === 'thinking' || part.type === 'text') &&
    typeof part.content === 'string'
  ) {
    return `${part.type}:${part.content}`
  }
  return part.type
}

function CallOwnershipPage() {
  const { messages, sendMessage } = useChat({
    threadId: 'call-ownership-1',
    connection: fetchServerSentEvents('/api/call-ownership-wire'),
  })

  const summary = messages
    .filter((message) => message.role === 'assistant')
    .map((message) => {
      const parts = message.parts.map((part) => partLabel(part)).join(',')
      return `${message.id} ${parts}`
    })
    .join(';')

  useEffect(() => {
    void sendMessage('go')
    // Fire the single run once on mount; the harness route ignores the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-testid="call-ownership-page">
      <div data-testid="assistants">{summary}</div>
    </div>
  )
}

export const Route = createFileRoute('/call-ownership')({
  component: CallOwnershipPage,
})
