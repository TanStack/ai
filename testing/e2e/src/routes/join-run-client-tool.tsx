import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

/**
 * Client half of the issue #1058 harness.
 *
 * `persistence: true` + a `threadId` from the URL. The spec reloads while the
 * first run is held open. On remount the client hydrates `activeRun` and tails
 * it with `joinRun`. The client tool polls `ALLOW_TOOL_KEY` and only finishes
 * after remount, so the dying first page cannot drain a live continuation.
 */

const ALLOW_TOOL_KEY = 'e2e-join-run-client-tool-allow'
const connection = fetchServerSentEvents('/api/join-run-client-tool')

const lookup = toolDefinition({
  name: 'lookup',
  description: 'Look up',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ answer: z.number() }),
}).client(async () => {
  const deadline = Date.now() + 60_000
  while (sessionStorage.getItem(ALLOW_TOOL_KEY) !== '1') {
    if (Date.now() > deadline) {
      throw new Error('client tool was not allowed')
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return { answer: 42 }
})

export const Route = createFileRoute('/join-run-client-tool')({
  component: JoinRunClientToolPage,
  validateSearch: (search: Record<string, unknown>) => ({
    threadId:
      typeof search.threadId === 'string' && search.threadId.length > 0
        ? search.threadId
        : 'join-run-client-tool-thread',
  }),
})

function JoinRunClientToolPage() {
  const { threadId } = Route.useSearch()
  const { messages, sendMessage, isLoading } = useChat({
    threadId,
    connection,
    persistence: true,
    tools: [lookup],
  })

  const [input, setInput] = useState('')
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  const assistantText = messages
    .filter((message) => message.role === 'assistant')
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'text' ? [part.content] : [],
      ),
    )
    .join('')

  const toolPending = messages.some((message) =>
    message.parts.some((part) => {
      if (part.type !== 'tool-call' || part.name !== 'lookup') return false
      return part.output === undefined
    }),
  )
  const toolRan = messages.some((message) =>
    message.parts.some((part) => {
      if (part.type !== 'tool-call' || part.name !== 'lookup') return false
      return part.output !== undefined
    }),
  )

  const handleSubmit = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    void sendMessage(text)
  }

  return (
    <div data-testid="join-run-client-tool-page" style={{ padding: 16 }}>
      {hydrated ? <div data-testid="hydration-marker" /> : null}
      <div data-testid="assistant-text">{assistantText || 'none'}</div>
      <div data-testid="client-tool-pending">
        {toolPending ? 'true' : 'false'}
      </div>
      <div data-testid="client-tool-ran">{toolRan ? 'true' : 'false'}</div>

      <div data-testid="message-list">
        {messages.map((message) => (
          <div
            key={message.id}
            data-testid={
              message.role === 'user' ? 'user-message' : 'assistant-message'
            }
          >
            {message.parts.map((part, index) =>
              part.type === 'text' ? (
                <span key={`${message.id}-${index}`}>{part.content}</span>
              ) : null,
            )}
          </div>
        ))}
      </div>

      {isLoading ? (
        <div data-testid="loading-indicator">Generating...</div>
      ) : null}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          data-testid="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Type a message..."
        />
        <button
          data-testid="send-button"
          onClick={handleSubmit}
          disabled={!input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}
