import { useMemo, useState } from 'react'
import { createFileRoute, useSearch } from '@tanstack/react-router'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-client'

type MockScenario =
  | 'simple-text'
  | 'tool-call'
  | 'multi-tool'
  | 'text-tool-text'
  | 'error'

const VALID_SCENARIOS: MockScenario[] = [
  'simple-text',
  'tool-call',
  'multi-tool',
  'text-tool-text',
  'error',
]

/**
 * Extract statistics from messages for testing
 */
function getMessageStats(messages: Array<UIMessage>) {
  const userMessages = messages.filter((m) => m.role === 'user')
  const assistantMessages = messages.filter((m) => m.role === 'assistant')

  const toolCallParts = assistantMessages.flatMap((m) =>
    m.parts.filter((p) => p.type === 'tool-call'),
  )

  const textParts = assistantMessages.flatMap((m) =>
    m.parts.filter((p) => p.type === 'text'),
  )

  const toolNames = toolCallParts.map((p) =>
    p.type === 'tool-call' ? p.name : '',
  )

  return {
    totalMessages: messages.length,
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length,
    toolCallCount: toolCallParts.length,
    textPartCount: textParts.length,
    toolNames: toolNames.join(','),
    hasToolCalls: toolCallParts.length > 0,
    lastAssistantText:
      textParts.length > 0 && textParts[textParts.length - 1]?.type === 'text'
        ? textParts[textParts.length - 1].content
        : '',
  }
}

function MockChatPage() {
  const { scenario: searchScenario } = useSearch({ from: '/mock' })

  // Use scenario from URL, validated
  const scenario: MockScenario = VALID_SCENARIOS.includes(
    searchScenario as MockScenario,
  )
    ? (searchScenario as MockScenario)
    : 'simple-text'

  // Use fetchServerSentEvents for the mock endpoint
  const connection = useMemo(() => {
    return fetchServerSentEvents('/api/mock-chat')
  }, [])

  const { messages, sendMessage, isLoading, stop, error } = useChat({
    connection,
    body: { scenario },
  })

  const [input, setInput] = useState('')
  const stats = getMessageStats(messages)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        padding: '20px',
      }}
      data-testid="chat-page"
      data-mock-scenario={scenario}
      data-is-loading={isLoading.toString()}
      data-has-error={!!error}
      data-message-count={stats.totalMessages}
      data-user-message-count={stats.userMessageCount}
      data-assistant-message-count={stats.assistantMessageCount}
      data-tool-call-count={stats.toolCallCount}
      data-has-tool-calls={stats.hasToolCalls.toString()}
      data-tool-names={stats.toolNames}
    >
      {/* Scenario indicator - scenario is controlled via URL param */}
      <div
        style={{
          marginBottom: '10px',
          padding: '8px',
          backgroundColor: '#e3f2fd',
          borderRadius: '4px',
        }}
      >
        <strong>Mock Scenario:</strong> {scenario}
      </div>

      {/* Input area */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          id="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim() && !isLoading) {
              sendMessage(input)
              setInput('')
            }
          }}
          placeholder="Type a message..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '10px',
            fontSize: '14px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
        <button
          id="submit-button"
          onClick={() => {
            if (input.trim()) {
              sendMessage(input)
              setInput('')
            }
          }}
          data-testid="submit-button"
          data-is-loading={isLoading.toString()}
          style={{
            padding: '10px 20px',
            fontSize: '14px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          Submit
        </button>
        {isLoading && (
          <button
            id="stop-button"
            onClick={stop}
            data-testid="stop-button"
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Stop
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div
          id="error-display"
          data-testid="error-display"
          data-error-message={error.message}
          style={{
            padding: '10px',
            marginBottom: '10px',
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '4px',
            color: '#c62828',
          }}
        >
          Error: {error.message}
        </div>
      )}

      {/* JSON Messages Display */}
      <div
        id="messages-json"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '10px',
          backgroundColor: '#f5f5f5',
          border: '1px solid #ddd',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '12px',
        }}
      >
        <pre
          id="messages-json-content"
          data-testid="messages-json-content"
          style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {JSON.stringify(messages, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/mock')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      scenario: search.scenario as string | undefined,
    }
  },
  component: MockChatPage,
})
