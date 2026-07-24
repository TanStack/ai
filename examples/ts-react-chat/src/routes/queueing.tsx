import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Send, Square, X, Zap } from 'lucide-react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { QueueConfig, QueuedMessage, UIMessage } from '@tanstack/ai-react'
import type { ModelOption } from '@/lib/model-selection'
import { DEFAULT_MODEL_OPTION, MODEL_OPTIONS } from '@/lib/model-selection'

/**
 * Showcase route for the client-side message queue.
 *
 * Three chats run side by side against the same endpoint, each hardwired to a
 * different `queue` strategy. A shared composer broadcasts the same message to
 * all three at once, so you can send a message, then send another WHILE the
 * first is still streaming, and watch each strategy diverge:
 *
 * - queue/fifo  → the second message is held and auto-sent after the first
 *   settles; it shows up as a cancellable pending item.
 * - interrupt   → the in-flight stream is aborted and the new message sends
 *   immediately (the queue never fills).
 * - queue/batch → multiple mid-stream messages are held, then merged into a
 *   single send when the stream settles.
 */

interface StrategyMeta {
  title: string
  blurb: string
  config: QueueConfig
}

const FIFO: StrategyMeta = {
  title: 'queue · fifo',
  blurb:
    'Messages sent while streaming are held and auto-sent one at a time, in order. Pending messages are cancellable until they drain.',
  config: { whenBusy: 'queue', drain: 'fifo' },
}
const INTERRUPT: StrategyMeta = {
  title: 'interrupt',
  blurb:
    'A message sent while streaming aborts the in-flight response and sends immediately. Unlike stop(), already-queued items are kept and still drain afterward.',
  config: { whenBusy: 'interrupt' },
}
const BATCH: StrategyMeta = {
  title: 'queue · batch',
  blurb:
    'Messages sent while streaming are held, then merged into a single send (joined by newlines) when the stream settles.',
  config: { whenBusy: 'queue', drain: 'batch' },
}

function textOf(message: UIMessage): string {
  return message.parts
    .flatMap((part) => (part.type === 'text' ? [part.content] : []))
    .join('')
}

interface PanelChat {
  messages: Array<UIMessage>
  isLoading: boolean
  queue: Array<QueuedMessage>
  cancelQueued: (id: string) => void
  stop: () => void
  error: Error | undefined
}

function StrategyPanel({
  strategy,
  chat,
}: {
  strategy: StrategyMeta
  chat: PanelChat
}) {
  const { messages, isLoading, queue, cancelQueued, stop, error } = chat
  const visible = messages.filter(
    (message) => textOf(message).trim().length > 0,
  )

  return (
    <div className="flex flex-1 flex-col rounded-lg border border-orange-500/20 bg-gray-800/40 min-w-0">
      <div className="border-b border-orange-500/10 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-semibold text-orange-400">
            {strategy.title}
          </span>
          {isLoading && (
            <button
              onClick={stop}
              className="flex items-center gap-1 rounded bg-red-600/80 px-2 py-1 text-xs text-white hover:bg-red-600"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </button>
          )}
        </div>
        <p className="mt-1 text-xs leading-snug text-gray-400">
          {strategy.blurb}
        </p>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {visible.length === 0 && (
          <p className="text-xs text-gray-500">No messages yet.</p>
        )}
        {visible.map((message) => (
          <div
            key={message.id}
            className={`rounded-lg px-3 py-2 text-sm ${
              message.role === 'assistant'
                ? 'bg-orange-500/5 text-gray-100'
                : 'bg-gray-700/40 text-gray-200'
            }`}
          >
            <span className="mr-1 text-xs font-medium text-gray-500">
              {message.role === 'assistant' ? 'AI' : 'You'}:
            </span>
            {textOf(message)}
          </div>
        ))}
        {isLoading && (
          <p className="text-xs text-orange-400/80">⏳ streaming…</p>
        )}
      </div>

      {error && (
        <div className="mx-3 mb-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-400">
          {error.message}
        </div>
      )}

      <div className="border-t border-orange-500/10 px-3 py-2">
        <p className="mb-1 text-xs font-medium text-gray-400">
          Queue ({queue.length})
        </p>
        {queue.length === 0 ? (
          <p className="text-xs text-gray-600">empty</p>
        ) : (
          <ul className="space-y-1">
            {queue.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded bg-gray-900/60 px-2 py-1 text-xs text-gray-300"
              >
                <span className="truncate">
                  {typeof item.content === 'string'
                    ? item.content
                    : '[multimodal]'}
                </span>
                <button
                  onClick={() => cancelQueued(item.id)}
                  className="shrink-0 text-gray-500 hover:text-red-400"
                  title="Cancel queued message"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function QueueingPage() {
  const [selectedModel, setSelectedModel] =
    useState<ModelOption>(DEFAULT_MODEL_OPTION)
  const [input, setInput] = useState('')

  const body = useMemo(
    () => ({ provider: selectedModel.provider, model: selectedModel.model }),
    [selectedModel.provider, selectedModel.model],
  )

  // One chat per strategy, called explicitly (fixed count, fixed order) so the
  // rules of hooks hold. The shared composer broadcasts the same text to all
  // three via their sendMessage functions.
  const fifo = useChat({
    connection: fetchServerSentEvents('/api/tanchat'),
    body,
    queue: FIFO.config,
  })
  const interrupt = useChat({
    connection: fetchServerSentEvents('/api/tanchat'),
    body,
    queue: INTERRUPT.config,
  })
  const batch = useChat({
    connection: fetchServerSentEvents('/api/tanchat'),
    body,
    queue: BATCH.config,
  })

  const panels = [
    { meta: FIFO, chat: fifo },
    { meta: INTERRUPT, chat: interrupt },
    { meta: BATCH, chat: batch },
  ]

  const broadcast = () => {
    const text = input.trim()
    if (!text) return
    void fifo.sendMessage(text)
    void interrupt.sendMessage(text)
    void batch.sendMessage(text)
    setInput('')
  }

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col bg-gray-900">
      <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
        <h1 className="text-lg font-semibold text-white">
          Queueing Strategies
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Send a message, then send another <em>while it is still streaming</em>{' '}
          — each panel reacts differently based on its <code>queue</code>{' '}
          config.
        </p>
        <div className="mt-3 max-w-sm">
          <label className="mb-1 block text-xs text-gray-400">Model</label>
          <select
            value={MODEL_OPTIONS.findIndex(
              (option) =>
                option.provider === selectedModel.provider &&
                option.model === selectedModel.model,
            )}
            onChange={(event) =>
              setSelectedModel(MODEL_OPTIONS[parseInt(event.target.value)])
            }
            className="w-full rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          >
            {MODEL_OPTIONS.map((option, index) => (
              <option key={index} value={index}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-1 gap-3 overflow-hidden p-3">
        {panels.map((panel) => (
          <StrategyPanel
            key={panel.meta.title}
            strategy={panel.meta}
            chat={panel.chat}
          />
        ))}
      </div>

      <div className="border-t border-orange-500/10 bg-gray-900/80 px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Type a message and send it to all three panels…"
            rows={1}
            className="flex-1 resize-none rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                broadcast()
              }
            }}
          />
          <button
            onClick={broadcast}
            disabled={!input.trim()}
            className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-medium text-white hover:bg-orange-400 disabled:bg-gray-700 disabled:text-gray-500"
            title="Send to all panels"
          >
            <Send className="h-4 w-4" />
            Send to all
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
          <Zap className="h-3 w-3" />
          Tip: send once, wait for streaming to start, then send again to see
          queueing, interrupting, and batching in action.
        </p>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/queueing')({
  component: QueueingPage,
})
