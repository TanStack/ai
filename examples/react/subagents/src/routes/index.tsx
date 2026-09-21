import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  fetchServerSentEvents,
  useChat,
  type UIMessage,
} from '@tanstack/ai-react'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { byok } from '@/lib/byok'

type SubagentHandle = Extract<
  UIMessage['parts'][number],
  { type: 'subagent' }
>['subagent']

function MessageBody({ message }: { message: UIMessage }) {
  return (
    <>
      {message.parts.map((part, index) => {
        if (part.type === 'text' && part.content) {
          return (
            <div
              key={`text-${index}`}
              className="whitespace-pre-wrap text-white"
            >
              {part.content}
            </div>
          )
        }
        if (part.type === 'subagent') {
          return <SubagentCard key={part.subagent.id} subagent={part.subagent} />
        }
        return null
      })}
    </>
  )
}

function SubagentCard({ subagent }: { subagent: SubagentHandle }) {
  return (
    <section className="mt-3 rounded-lg border border-orange-500/30 bg-gray-900/80 p-3">
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <strong className="text-sm text-orange-300">{subagent.name}</strong>
        <span className="text-xs text-gray-400">{subagent.status}</span>
        {subagent.status === 'running' ? (
          <button
            type="button"
            onClick={() => subagent.stop?.()}
            className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Stop
          </button>
        ) : null}
      </header>
      {subagent.error ? (
        <p className="text-xs text-red-400">{subagent.error.message}</p>
      ) : null}
      {subagent.messages.map((childMessage) => (
        <div key={childMessage.id} className="mt-2">
          <MessageBody message={childMessage} />
        </div>
      ))}
    </section>
  )
}

function Messages({ messages }: { messages: Array<UIMessage> }) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const visibleMessages = messages.filter((message) =>
    message.parts.some((part) => {
      if (part.type === 'text' && part.content.trim()) return true
      return part.type === 'subagent'
    }),
  )

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }, [visibleMessages])

  if (!visibleMessages.length) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-2 text-xl font-semibold text-white">
            Blog desk
          </h2>
          <p className="text-sm text-gray-400">
            Paste an OpenRouter key. Ask for research or a draft. Jev picks the
            agent.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      {visibleMessages.map((message) => (
        <div
          key={message.id}
          className={`mb-2 rounded-lg p-4 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-white ${
                message.role === 'assistant'
                  ? 'bg-linear-to-r from-orange-500 to-red-600'
                  : 'bg-gray-700'
              }`}
            >
              {message.role === 'assistant' ? 'AI' : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <MessageBody message={message} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ChatPage() {
  const [input, setInput] = useState('')
  const { messages, subagents, sendMessage, isLoading, error, stop } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
    byok,
  })

  const handleSendMessage = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex h-screen bg-gray-900">
      <div className="flex w-full flex-col">
        <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
          <OpenRouterKeyForm />
        </div>

        <Messages messages={messages} />

        {subagents.length > 0 ? (
          <aside className="border-t border-orange-500/10 px-4 py-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Subagents
            </h2>
            {subagents.map((subagent) => (
              <p
                key={subagent.id}
                className="mb-1 flex items-center gap-2 text-sm text-gray-200"
              >
                <span>
                  {subagent.name}: {subagent.status}
                </span>
                {subagent.status === 'running' ? (
                  <button
                    type="button"
                    onClick={() => subagent.stop?.()}
                    className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                  >
                    Stop
                  </button>
                ) : null}
              </p>
            ))}
          </aside>
        ) : null}

        {error ? (
          <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error.message}
          </div>
        ) : null}

        <div className="border-t border-orange-500/10 bg-gray-900/80">
          <div className="w-full px-4 py-3">
            {isLoading ? (
              <div className="mb-3 flex items-center justify-center">
                <button
                  type="button"
                  onClick={stop}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Stop
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask for research, or ask for a draft..."
                className="w-full resize-none rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                rows={1}
                disabled={isLoading}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    input.trim()
                  ) {
                    event.preventDefault()
                    handleSendMessage()
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!input.trim() || isLoading}
                className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
