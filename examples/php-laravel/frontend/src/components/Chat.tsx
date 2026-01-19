import { useState, useRef, useEffect } from 'react'
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'
import { createChatClientOptions } from '@tanstack/ai-client'
import { Send, Square } from 'lucide-react'

const chatOptions = createChatClientOptions({
  connection: fetchServerSentEvents('http://localhost:8020/api/chat'),
})

function Chat() {
  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: chatOptions.connection,
  })

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    sendMessage(input)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="chat-container">
      <div className="messages-container">
        {messages.length === 0 && (
          <div className="empty-state">
            <p>Start a conversation by sending a message below.</p>
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`message message-${message.role}`}>
            <div className="message-role">
              {message.role === 'user' ? 'You' : 'AI'}
            </div>
            <div className="message-content">
              {message.parts.map((part, index) => {
                if (part.type === 'text' && part.content) {
                  return (
                    <div key={index} className="text-part">
                      {part.content}
                    </div>
                  )
                }
                if (part.type === 'thinking' && part.content) {
                  return (
                    <div key={index} className="thinking-part">
                      <strong>Thinking:</strong> {part.content}
                    </div>
                  )
                }
                if (part.type === 'tool-call') {
                  let parsedArgs = null
                  try {
                    parsedArgs = part.arguments
                      ? JSON.parse(part.arguments)
                      : null
                  } catch (e) {
                    console.error(
                      'Failed to parse tool arguments:',
                      part.arguments,
                      e,
                    )
                  }
                  return (
                    <div key={index} className="tool-call-part">
                      <strong>Tool Call:</strong> {part.name}
                      {parsedArgs && (
                        <pre className="tool-args">
                          {JSON.stringify(parsedArgs, null, 2)}
                        </pre>
                      )}
                      {part.output && (
                        <pre className="tool-output">
                          {JSON.stringify(part.output, null, 2)}
                        </pre>
                      )}
                    </div>
                  )
                }
                return null
              })}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message message-assistant">
            <div className="message-role">AI</div>
            <div className="message-content">
              <div className="typing-indicator">...</div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        {isLoading && (
          <button
            type="button"
            onClick={stop}
            className="stop-button"
            aria-label="Stop generation"
          >
            <Square className="icon" />
            Stop
          </button>
        )}
        <div className="input-wrapper">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Shift+Enter for new line)"
            className="message-input"
            rows={1}
            disabled={isLoading}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement
              target.style.height = 'auto'
              target.style.height = Math.min(target.scrollHeight, 200) + 'px'
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="send-button"
            aria-label="Send message"
          >
            <Send className="icon" />
          </button>
        </div>
      </form>
    </div>
  )
}

export default Chat
