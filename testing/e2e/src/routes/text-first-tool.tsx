import { createFileRoute, useHydrated } from '@tanstack/react-router'
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

  // Sending is a user action, so it runs from a click and not a mount effect.
  // The button stays disabled until hydration, so the spec's click reaches React.
  const hydrated = useHydrated()
  const send = () => {
    void sendMessage('go')
  }

  return (
    <div data-testid="text-first-tool-page">
      <button data-testid="send" disabled={!hydrated} onClick={send}>
        Send
      </button>
      <div data-testid="assistant-text">{assistantText}</div>
    </div>
  )
}

export const Route = createFileRoute('/text-first-tool')({
  component: TextFirstToolPage,
})
