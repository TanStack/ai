import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

function ChatPage() {
  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents('/api/tanchat'),
  })
  const [input, setInput] = useState('')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        padding: '20px',
      }}
    >
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
