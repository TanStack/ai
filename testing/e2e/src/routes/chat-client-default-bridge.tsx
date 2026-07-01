import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ChatClient } from '@tanstack/ai-client'
import type { UIMessage } from '@tanstack/ai-client'

export const Route = createFileRoute('/chat-client-default-bridge')({
  component: ChatClientDefaultBridgePage,
})

// Covers the vanilla `ChatClient` shipping default: no `devtoolsBridgeFactory`,
// so the client falls back to the no-op devtools bridge. The framework hooks
// (`useChat` etc.) always inject the real bridge, so every other route in this
// suite bypasses the no-op path entirely. A static SSE body keeps the scenario
// deterministic; the transport is not what is under test here.
const SSE_BODY = [
  'data: {"type":"RUN_STARTED","threadId":"thread-default-bridge","runId":"run-default-bridge"}\n\n',
  'data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-default-bridge","model":"test","timestamp":0,"delta":"Hi from the assistant","content":"Hi from the assistant"}\n\n',
  'data: {"type":"RUN_FINISHED","threadId":"thread-default-bridge","runId":"run-default-bridge","model":"test","timestamp":0,"finishReason":"stop"}\n\n',
].join('')

function ChatClientDefaultBridgePage() {
  const [messages, setMessages] = useState<Array<UIMessage>>([])
  const [error, setError] = useState<string | null>(null)
  const [client] = useState(
    () =>
      new ChatClient({
        fetcher: () =>
          new Response(SSE_BODY, {
            headers: { 'Content-Type': 'text/event-stream' },
          }),
        onMessagesChange: setMessages,
      }),
  )

  // The button starts disabled in the server-rendered HTML and enables on
  // hydration, so Playwright's actionability check cannot click before the
  // onClick handler is attached.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    setHydrated(true)
  }, [])

  const handleSend = () => {
    client
      .sendMessage('hello from the vanilla client')
      .catch((sendError: unknown) => setError(String(sendError)))
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">
        Vanilla ChatClient (default no-op devtools bridge)
      </h1>
      <button
        data-testid="send-button"
        type="button"
        disabled={!hydrated}
        onClick={handleSend}
      >
        Send
      </button>
      {error !== null && <div data-testid="send-error">{error}</div>}
      <div data-testid="messages">
        {messages.map((message) => (
          <div
            key={message.id}
            data-testid={
              message.role === 'user' ? 'user-message' : 'assistant-message'
            }
          >
            {message.parts
              .map((part) => (part.type === 'text' ? part.content : ''))
              .join('')}
          </div>
        ))}
      </div>
    </div>
  )
}
