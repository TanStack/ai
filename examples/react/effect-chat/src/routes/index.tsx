import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

function ChatPage() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    threadId: 'effect-chat',
  })

  const handleSendMessage = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col gap-3 p-4 text-white">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-gray-400">
            Ask for the weather in a city.
          </p>
        ) : null}
        {messages.map((message) => (
          <div key={message.id}>
            <p className="text-xs text-gray-400">{message.role}</p>
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return (
                  <p key={index} className="whitespace-pre-wrap">
                    {part.content}
                  </p>
                )
              }
              if (part.type === 'tool-call') {
                return (
                  <p key={index} className="text-sm text-orange-400">
                    Called {part.name}
                  </p>
                )
              }
              return null
            })}
          </div>
        ))}
      </div>
      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSendMessage()
            }
          }}
          placeholder="What is the weather in Oslo?"
          rows={1}
          disabled={isLoading}
          className="flex-1 resize-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm"
        />
        {isLoading ? (
          <button
            type="button"
            onClick={stop}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={!input.trim()}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
