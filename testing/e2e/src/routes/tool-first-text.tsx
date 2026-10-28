import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

/**
 * Harness page for issue #1247: a tool call whose `parentMessageId` precedes
 * that message's `TEXT_MESSAGE_START`. `/api/tool-first-text-wire` streams
 * that shape once; this page renders the resulting assistant text so the
 * spec can assert the first delta was not dropped.
 */
function ToolFirstTextPage() {
  const { messages, sendMessage } = useChat({
    threadId: 'tool-first-text-1',
    connection: fetchServerSentEvents('/api/tool-first-text-wire'),
  })

  const assistantText = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'text' ? [part.content] : [],
      ),
    )
    .join('')

  useEffect(() => {
    void sendMessage('go')
    // Fire the single run once on mount; the harness route ignores the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div data-testid="tool-first-text-page">
      <div data-testid="assistant-text">{assistantText}</div>
    </div>
  )
}

export const Route = createFileRoute('/tool-first-text')({
  component: ToolFirstTextPage,
})
