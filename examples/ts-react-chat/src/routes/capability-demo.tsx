import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Send, Sparkles, Square } from 'lucide-react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import type { UIMessage } from '@tanstack/ai-react'

interface SessionConfig {
  persona: string
  provideCapability: boolean
  /** Bumped on every Apply so the chat surface remounts with a fresh session. */
  seq: number
}

function Messages({ messages }: { messages: Array<UIMessage> }) {
  const visible = messages.filter((m) =>
    m.parts.some((p) => p.type === 'text' && p.content.trim()),
  )

  if (!visible.length) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <p className="text-center text-sm text-gray-400">
          Send a message — the assistant should answer in the persona supplied
          by the capability.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {visible.map((message) => (
        <div
          key={message.id}
          className={`mb-2 rounded-lg p-4 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-cyan-500/5 to-blue-600/5'
              : 'bg-transparent'
          }`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-white ${
                message.role === 'assistant'
                  ? 'bg-linear-to-r from-cyan-500 to-blue-600'
                  : 'bg-gray-700'
              }`}
            >
              {message.role === 'assistant' ? 'AI' : 'U'}
            </div>
            <div className="min-w-0 flex-1">
              {message.parts.map((part, index) =>
                part.type === 'text' && part.content ? (
                  <p
                    key={`text-${index}`}
                    className="whitespace-pre-wrap text-white"
                  >
                    {part.content}
                  </p>
                ) : null,
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function ChatSurface({ config }: { config: SessionConfig }) {
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    threadId: `capability-demo-${config.seq}`,
    connection: fetchServerSentEvents('/api/capability-demo'),
    // Forwarded to the route as `forwardedProps`: the provider middleware
    // provides `capabilityValue`; `provideCapability=false` omits the provider
    // so chat() throws the capability validation error.
    body: {
      capabilityValue: config.persona,
      provideCapability: config.provideCapability,
    },
  })

  const [input, setInput] = useState('')

  const handleSend = () => {
    if (!input.trim()) return
    sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Messages messages={messages} />

      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <span className="font-semibold">chat() error:</span> {error.message}
        </div>
      )}

      <div className="border-t border-cyan-500/10 bg-gray-900/80 backdrop-blur-sm">
        <div className="w-full space-y-2 px-4 py-3">
          {isLoading && (
            <div className="flex items-center justify-center">
              <button
                onClick={stop}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                <Square className="h-4 w-4 fill-current" />
                Stop
              </button>
            </div>
          )}
          <div className="relative flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Say hello..."
              className="w-full resize-none overflow-hidden rounded-lg border border-cyan-500/20 bg-gray-800/50 py-3 pl-4 pr-12 text-sm text-white placeholder-gray-400 shadow-lg focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              rows={1}
              style={{ minHeight: '44px', maxHeight: '200px' }}
              disabled={isLoading}
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
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-cyan-500 transition-colors hover:text-cyan-400 disabled:text-gray-500 focus:outline-none"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CapabilityDemoPage() {
  const [draftPersona, setDraftPersona] = useState('a cheerful pirate captain')
  const [draftProvide, setDraftProvide] = useState(true)
  const [config, setConfig] = useState<SessionConfig>({
    persona: 'a cheerful pirate captain',
    provideCapability: true,
    seq: 0,
  })

  const apply = () => {
    setConfig((prev) => ({
      persona: draftPersona,
      provideCapability: draftProvide,
      seq: prev.seq + 1,
    }))
  }

  const dirty =
    draftPersona !== config.persona || draftProvide !== config.provideCapability

  return (
    <div className="flex h-[calc(100vh-72px)] flex-col bg-gray-900">
      <div className="shrink-0 border-b border-cyan-500/20 bg-gray-800 px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">
            Middleware Capabilities
          </h2>
        </div>
        <p className="mb-3 text-xs text-gray-400">
          A <span className="text-cyan-300">provider</span> middleware supplies
          a persona capability in <code className="text-gray-300">setup()</code>
          ; a <span className="text-cyan-300">consumer</span> middleware reads
          it in <code className="text-gray-300">onConfig()</code> and injects a
          system prompt. With the capability provided, the middleware is wired
          through the type-safe{' '}
          <code className="text-gray-300">
            createChatMiddleware().use().build()
          </code>{' '}
          builder. Uncheck “Provide capability” to omit the provider and watch{' '}
          <code className="text-gray-300">chat()</code> throw the runtime
          validation error. Requires{' '}
          <code className="text-gray-300">OPENAI_API_KEY</code>.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-gray-500">
              Persona (capability value)
            </span>
            <input
              type="text"
              value={draftPersona}
              onChange={(e) => setDraftPersona(e.target.value)}
              className="w-72 rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-sm text-white focus:border-cyan-500/50 focus:outline-none"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-600 bg-gray-700/50 px-3 py-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={draftProvide}
              onChange={(e) => setDraftProvide(e.target.checked)}
            />
            <span>Provide capability</span>
          </label>

          <button
            onClick={apply}
            disabled={!dirty}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700 disabled:bg-gray-600 disabled:text-gray-400"
          >
            {config.seq === 0 ? 'Start session' : 'Apply (new session)'}
          </button>
        </div>
      </div>

      <ChatSurface key={config.seq} config={config} />
    </div>
  )
}

export const Route = createFileRoute('/capability-demo')({
  component: CapabilityDemoPage,
})
