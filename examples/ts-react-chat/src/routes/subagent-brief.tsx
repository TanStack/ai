import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { researcher } from '../lib/researcher-agent'
import type { UIMessage } from '@tanstack/ai-react'

export const Route = createFileRoute('/subagent-brief')({
  component: SubagentBriefPage,
})

function childText(messages: ReadonlyArray<UIMessage>) {
  return messages
    .flatMap((message) =>
      message.parts.flatMap((part) =>
        part.type === 'text' ? [part.content] : [],
      ),
    )
    .join('')
}

function SubagentBriefPage() {
  const { messages, sendMessage, isLoading } = useChat({
    threadId: 'subagent-brief',
    connection: fetchServerSentEvents('/api/subagent-brief'),
    // Types `part.subagent.input` from the researcher's inputSchema.
    subagents: [researcher],
  })
  const [input, setInput] = useState(
    'We picked three sea animals earlier: squid, octopus, and cuttlefish. Find how many hearts each one has.',
  )

  return (
    <div style={page}>
      <h1>Subagent brief</h1>
      <p style={{ color: '#555' }}>
        The parent model writes a short task for the <code>researcher</code>{' '}
        subagent. The researcher reads only that task.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((message) => (
          <div key={message.id} data-testid={`message-${message.role}`}>
            <div style={roleLabel}>{message.role}</div>
            {message.parts.map((part, index) => {
              if (part.type === 'text' && part.content) {
                return (
                  <p key={index} data-testid="text" style={{ margin: 0 }}>
                    {part.content}
                  </p>
                )
              }
              if (part.type !== 'subagent') return null
              return (
                <section key={index} data-testid="card" style={card}>
                  <div>
                    <strong>{part.subagent.name}</strong>{' '}
                    <span data-testid="card-status">
                      {part.subagent.status}
                    </span>
                  </div>
                  <div data-testid="brief" style={{ color: '#444' }}>
                    Brief: {part.subagent.input?.task ?? '(none)'}
                  </div>
                  <p data-testid="card-text" style={{ margin: 0 }}>
                    {childText(part.subagent.messages)}
                  </p>
                </section>
              )
            })}
          </div>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          const text = input.trim()
          if (!text || isLoading) return
          setInput('')
          void sendMessage(text)
        }}
        style={{ marginTop: 16, display: 'flex', gap: 8 }}
      >
        <input
          data-testid="input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button data-testid="send" type="submit" disabled={isLoading}>
          {isLoading ? 'Running...' : 'Send'}
        </button>
      </form>
    </div>
  )
}

const page: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: 24,
  fontFamily: 'system-ui, sans-serif',
}

const card: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 8,
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const roleLabel: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  color: '#999',
}
