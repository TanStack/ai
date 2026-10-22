import { useEffect, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  fetchServerSentEvents,
  useChat,
  type GenericInterrupt,
  type UIMessage,
} from '@tanstack/ai-react'
import { computerSafetyCheck } from '@tanstack/ai-computer-use'

const TASK = `You are on the TanStack home page. Find the TanStack AI documentation page about computer use.
Use the screenshots. Click, type, and scroll only on what you can see. Do not type a URL from memory.
When the page is the computer use docs, say the page title and stop.`

type Part = UIMessage['parts'][number]

/** The screenshots in one tool result, as `<img>` sources. */
function screenshots(part: Part) {
  if (part.type !== 'tool-result' || typeof part.content === 'string') return []
  return part.content.flatMap((content) => {
    if (content.type !== 'image') return []
    const { source } = content
    if (source.type === 'data') {
      return [`data:${source.mimeType};base64,${source.value}`]
    }
    return source.type === 'url' ? [source.value] : []
  })
}

function Messages({ messages }: { messages: ReadonlyArray<UIMessage> }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  if (!messages.length) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-2 text-xl font-semibold text-white">
            Computer Use
          </h2>
          <p className="text-sm text-gray-400">
            Click Send. A Chromium window opens on tanstack.com, and the model
            looks for the computer use docs. Each screenshot shows here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`mb-2 rounded-lg p-4 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          {message.parts.map((part, index) => {
            if (part.type === 'text' && part.content) {
              return (
                <div key={index} className="whitespace-pre-wrap text-white">
                  {part.content}
                </div>
              )
            }
            return screenshots(part).map((src) => (
              <img
                key={`${index}-${src.slice(-16)}`}
                src={src}
                alt="What the model sees"
                className="my-2 max-w-xl rounded border border-gray-700"
              />
            ))
          })}
        </div>
      ))}
    </div>
  )
}

/** OpenAI can mark an action as risky. A person approves it before it runs. */
function SafetyCheckCard({
  interrupt,
}: {
  interrupt: GenericInterrupt<typeof computerSafetyCheck>
}) {
  const checks = interrupt.payload?.checks ?? []
  return (
    <div className="mx-4 mt-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-100">
      <p className="font-medium">Approve this computer action?</p>
      <ul className="my-2 list-disc pl-5">
        {checks.map((check) => (
          <li key={check.id}>{check.message ?? check.code ?? check.id}</li>
        ))}
      </ul>
      <pre className="mb-2 overflow-x-auto text-xs">
        {JSON.stringify(interrupt.payload?.action, null, 2)}
      </pre>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => interrupt.resolveInterrupt({ approved: true })}
          className="rounded bg-orange-500 px-3 py-1 text-white"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => interrupt.resolveInterrupt({ approved: false })}
          className="rounded bg-gray-700 px-3 py-1 text-white"
        >
          Decline
        </button>
      </div>
    </div>
  )
}

function ChatPage() {
  const [input, setInput] = useState(TASK)
  const { messages, sendMessage, isLoading, error, stop, interrupts } = useChat(
    {
      connection: fetchServerSentEvents('/api/chat'),
      threadId: 'computer-use',
      interrupts: [computerSafetyCheck],
    },
  )

  const handleSendMessage = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex h-screen bg-gray-900">
      <div className="flex w-full flex-col">
        <Messages messages={messages} />

        {interrupts.map((interrupt) => {
          if (interrupt.kind !== 'generic') return null
          if (!('definitionId' in interrupt)) return null
          if (interrupt.definitionId !== computerSafetyCheck.id) return null
          return <SafetyCheckCard key={interrupt.id} interrupt={interrupt} />
        })}

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
                placeholder="Tell the model what to do on the page..."
                className="w-full resize-none rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                rows={3}
                disabled={isLoading}
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
