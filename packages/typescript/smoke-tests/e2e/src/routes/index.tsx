import { useState, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-client'

type ApiMode = 'real' | 'mock'
type MockScenario =
  | 'simple-text'
  | 'tool-call'
  | 'multi-tool'
  | 'text-tool-text'
  | 'error'

/**
 * Create a connection adapter that sends the mock scenario in the body
 */
function createMockConnection(scenario: MockScenario) {
  return {
    async *connect(
      messages: Array<any>,
      body: Record<string, any>,
      abortSignal?: AbortSignal,
    ) {
      const response = await fetch('/api/mock-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, messages, scenario }),
        signal: abortSignal,
      })

      if (!response.ok) {
        throw new Error(`Mock API error: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              yield JSON.parse(data)
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    },
  }
}

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

function ChatPage() {
  const [apiMode, setApiMode] = useState<ApiMode>('real')
  const [mockScenario, setMockScenario] = useState<MockScenario>('simple-text')

  const connection = useMemo(() => {
    if (apiMode === 'mock') {
      return createMockConnection(mockScenario)
    }
    return fetchServerSentEvents('/api/tanchat')
  }, [apiMode, mockScenario])

  const { messages, sendMessage, isLoading, stop, error } = useChat({
    connection,
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
      data-api-mode={apiMode}
      data-mock-scenario={mockScenario}
      data-is-loading={isLoading.toString()}
      data-has-error={!!error}
      data-message-count={stats.totalMessages}
      data-user-message-count={stats.userMessageCount}
      data-assistant-message-count={stats.assistantMessageCount}
      data-tool-call-count={stats.toolCallCount}
      data-has-tool-calls={stats.hasToolCalls.toString()}
      data-tool-names={stats.toolNames}
    >
      {/* API Mode Selector */}
      <div
        id="api-mode-selector"
        style={{
          display: 'flex',
          gap: '10px',
          marginBottom: '10px',
          alignItems: 'center',
        }}
      >
        <label>
          <input
            type="radio"
            name="apiMode"
            value="real"
            checked={apiMode === 'real'}
            onChange={() => setApiMode('real')}
            data-testid="api-mode-real"
          />
          Real API
        </label>
        <label>
          <input
            type="radio"
            name="apiMode"
            value="mock"
            checked={apiMode === 'mock'}
            onChange={() => setApiMode('mock')}
            data-testid="api-mode-mock"
          />
          Mock API
        </label>

        {apiMode === 'mock' && (
          <select
            id="mock-scenario-select"
            value={mockScenario}
            onChange={(e) => setMockScenario(e.target.value as MockScenario)}
            data-testid="mock-scenario-select"
            style={{ marginLeft: '10px', padding: '5px' }}
          >
            <option value="simple-text">Simple Text</option>
            <option value="tool-call">Tool Call</option>
            <option value="multi-tool">Multiple Tools</option>
            <option value="text-tool-text">Text + Tool + Text</option>
            <option value="error">Error</option>
          </select>
        )}
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
          data-input-value={input}
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

export const Route = createFileRoute('/')({
  component: ChatPage,
})
