import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useChat } from '@tanstack/ai-react'
import { Send, Square } from 'lucide-react'
import { chatFn } from '@/lib/server-fns'

export const Route = createFileRoute('/server-fn-chat')({
  component: ServerFnChat,
})

function ServerFnChat() {
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    fetcher: ({ messages }, { signal }) =>
      chatFn({ data: { messages }, signal }),
  })
  const [input, setInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    void sendMessage(input)
    setInput('')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 bg-gray-900/60 px-4 py-3">
        <h2 className="text-lg font-semibold">Chat via server function</h2>
        <p className="text-xs text-gray-400 mt-1">
          <code className="text-cyan-400">
            useChat(&#123; fetcher: ({'{'}messages{'}'}, {'{'}signal{'}'}) =&gt;
            chatFn({'{'} data, signal {'}'}) &#125;)
          </code>{' '}
          — the server function returns an SSE{' '}
          <code className="text-cyan-400">Response</code>; the chat client
          parses it.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm">
            Say something to start the chat.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-2xl rounded-lg px-3 py-2 ${
              m.role === 'user'
                ? 'ml-auto bg-cyan-700/40 border border-cyan-600/40'
                : 'mr-auto bg-gray-800 border border-gray-700'
            }`}
          >
            {m.parts.map((part, i) =>
              part.type === 'text' ? <span key={i}>{part.content}</span> : null,
            )}
          </div>
        ))}
        {error && (
          <div className="rounded-lg border border-red-700/60 bg-red-900/30 px-3 py-2 text-sm text-red-200">
            {error.message}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-800 bg-gray-900/80 p-3 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message..."
          disabled={isLoading}
          className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
        />
        {isLoading ? (
          <button
            type="button"
            onClick={stop}
            className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white"
            aria-label="Stop"
          >
            <Square size={18} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        )}
      </form>
    </div>
  )
}
