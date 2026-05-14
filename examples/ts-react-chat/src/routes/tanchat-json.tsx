import { useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Send, Square } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useChat } from '@tanstack/ai-react'
import { fetchJSON } from '@tanstack/ai-client'
import type { UIMessage } from '@tanstack/ai-react'

// Showcase for the toJSONResponse → fetchJSON pair.
//
// `fetchJSON` is the connection adapter to use when the server runtime
// can't emit a streaming Response — Expo's `@expo/server`, certain edge
// proxies, sandboxed previews. The server pairs it with `toJSONResponse`
// (see /src/routes/api.tanchat-json.ts), drains the chat stream fully,
// and returns the collected chunks as a single JSON array.
//
// The UI cost: no incremental rendering. The user sees nothing until the
// whole request resolves, then every chunk arrives at once. Prefer SSE
// (`fetchServerSentEvents`) or HTTP-stream (`fetchHttpStream`) when the
// runtime supports them — this adapter exists for runtimes that don't.

function MessageList({ messages }: { messages: Array<UIMessage> }) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-md text-center text-gray-400">
          <p className="text-sm">
            Send a message — the response will arrive in one shot when the
            server finishes draining the stream.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`p-4 rounded-lg mb-2 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium text-white shrink-0 ${
                message.role === 'assistant'
                  ? 'bg-linear-to-r from-orange-500 to-red-600'
                  : 'bg-gray-700'
              }`}
            >
              {message.role === 'assistant' ? 'AI' : 'U'}
            </div>
            <div className="flex-1 min-w-0 text-white prose dark:prose-invert max-w-none">
              {message.parts.map((part, index) => {
                if (part.type === 'text' && part.content) {
                  return (
                    <ReactMarkdown key={index}>{part.content}</ReactMarkdown>
                  )
                }
                return null
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TanChatJsonPage() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { messages, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchJSON('/api/tanchat-json'),
    body: { provider: 'openai', model: 'gpt-4o' },
  })

  const handleSend = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  return (
    <div className="flex h-[calc(100vh-72px)] bg-gray-900">
      <div className="w-full flex flex-col">
        <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-white">
              Non-streaming chat (toJSONResponse / fetchJSON)
            </h2>
            <p className="text-xs text-gray-400">
              Server drains the chat stream and returns it as a single JSON
              array. Use this on runtimes that can't emit ReadableStream
              responses (e.g. Expo). UI sees everything at once.
            </p>
          </div>
          <Link
            to="/"
            className="px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors text-xs font-medium whitespace-nowrap"
          >
            Streaming demo →
          </Link>
        </div>

        <MessageList messages={messages} />

        {error && (
          <div className="mx-4 mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
            {error.message}
          </div>
        )}

        <div className="border-t border-orange-500/10 bg-gray-900/80 backdrop-blur-sm">
          <div className="w-full px-4 py-3 space-y-3">
            {isLoading && (
              <div className="flex items-center justify-center">
                <button
                  onClick={stop}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop
                </button>
              </div>
            )}

            <div className="relative flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask for a guitar recommendation…"
                  className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
                  rows={1}
                  style={{ minHeight: '44px', maxHeight: '200px' }}
                  disabled={isLoading}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height =
                      Math.min(target.scrollHeight, 200) + 'px'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-500 hover:text-orange-400 disabled:text-gray-500 transition-colors focus:outline-none"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/tanchat-json')({
  component: TanChatJsonPage,
})
