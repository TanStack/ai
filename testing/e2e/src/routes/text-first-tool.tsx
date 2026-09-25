import { useEffect } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

/**
 * Harness page for issue #1247 in the order where the message's
 * `TEXT_MESSAGE_START` precedes the tool call. `/api/text-first-tool-wire`
 * streams that shape once; this page renders the resulting assistant text so
 * the spec can assert the first delta was not dropped.
 */
function TextFirstToolPage() {
  const { messages, sendMessage } = useChat({
    threadId: 'text-first-tool-1',
    connection: fetchServerSentEvents('/api/text-first-tool-wire'),
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
    <div data-testid="text-first-tool-page">
      <div data-testid="assistant-text">{assistantText}</div>
    </div>
  )
}

export const Route = createFileRoute('/text-first-tool')({
  component: TextFirstToolPage,
})
