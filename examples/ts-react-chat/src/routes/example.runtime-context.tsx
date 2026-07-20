import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  BadgeCheck,
  MonitorSmartphone,
  Send,
  Server,
  Square,
  UserRound,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import type { UIMessage } from '@tanstack/ai-react'
import type { ModelOption } from '@/lib/model-selection'
import type { ClientRuntimeContext } from '@/lib/guitar-tools'
import {
  inspectClientRuntimeContextToolDef,
  inspectServerRuntimeContextToolDef,
} from '@/lib/guitar-tools'
import { DEFAULT_MODEL_OPTION, MODEL_OPTIONS } from '@/lib/model-selection'

type RuntimeProfile = ClientRuntimeContext & {
  label: string
  description: string
}

const RUNTIME_PROFILES: Array<RuntimeProfile> = [
  {
    label: 'Studio Buyer',
    description: 'Northstar Music platinum account',
    userId: 'user_studio_42',
    tenantId: 'northstar-music',
    loyaltyTier: 'platinum',
    preferredStyle: 'electric',
  },
  {
    label: 'Acoustic Collector',
    description: 'Cedar Room returning customer',
    userId: 'user_acoustic_18',
    tenantId: 'cedar-room',
    loyaltyTier: 'gold',
    preferredStyle: 'acoustic',
  },
  {
    label: 'Experimental Artist',
    description: 'Signal Lab first-session account',
    userId: 'user_signal_07',
    tenantId: 'signal-lab',
    loyaltyTier: 'standard',
    preferredStyle: 'experimental',
  },
]

const inspectClientRuntimeContextToolClient =
  inspectClientRuntimeContextToolDef.client<ClientRuntimeContext>(
    (_, executionContext) => ({
      ...executionContext.context,
      source: 'client' as const,
    }),
  )

const runtimeContextTools = clientTools(
  inspectClientRuntimeContextToolClient,
  inspectServerRuntimeContextToolDef,
)

type RuntimeContextMessage = UIMessage<typeof runtimeContextTools>

function RuntimeContextSummary({ profile }: { profile: RuntimeProfile }) {
  const values = [
    ['User', profile.userId],
    ['Tenant', profile.tenantId],
    ['Tier', profile.loyaltyTier],
    ['Style', profile.preferredStyle],
  ]

  return (
    <div className="grid grid-cols-2 gap-2">
      {values.map(([label, value]) => (
        <div
          key={label}
          className="rounded-lg border border-gray-700/80 bg-gray-950/80 px-3 py-2"
        >
          <div className="text-xs uppercase text-gray-500">{label}</div>
          <div className="truncate text-sm font-medium text-white">{value}</div>
        </div>
      ))}
    </div>
  )
}

function RuntimeContextToolResult({
  name,
  output,
}: {
  name: string
  output: unknown
}) {
  const isClientTool = name === 'inspectClientRuntimeContext'

  return (
    <div className="mt-2 rounded-lg border border-orange-500/20 bg-gray-950/90 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-orange-200">
        {isClientTool ? (
          <MonitorSmartphone className="h-4 w-4" />
        ) : (
          <Server className="h-4 w-4" />
        )}
        {isClientTool ? 'Client runtime context' : 'Server runtime context'}
      </div>
      <pre className="overflow-x-auto rounded-md bg-gray-900 p-3 text-xs leading-5 text-gray-200">
        {JSON.stringify(output, null, 2)}
      </pre>
    </div>
  )
}

function RuntimeMessages({
  messages,
}: {
  messages: Array<RuntimeContextMessage>
}) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const visibleMessages = messages.filter((message) =>
    message.parts.some((part) => {
      if (part.type === 'text' && part.content.trim()) return true
      if (
        part.type === 'tool-call' &&
        (part.name === 'inspectClientRuntimeContext' ||
          part.name === 'inspectServerRuntimeContext')
      ) {
        return true
      }
      return false
    }),
  )

  useEffect(() => {
    if (!messagesContainerRef.current) return
    messagesContainerRef.current.scrollTop =
      messagesContainerRef.current.scrollHeight
  }, [visibleMessages])

  if (!visibleMessages.length) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-10 text-center">
        <div>
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-300">
            <BadgeCheck className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-semibold text-white">
            Runtime Context Lab
          </h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-gray-400">
            Pick a profile, then run the client, server, or combined context
            prompt.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={messagesContainerRef} className="h-full overflow-y-auto p-4">
      {visibleMessages.map((message) => (
        <div
          key={message.id}
          className={`mb-3 rounded-lg p-4 ${
            message.role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-gray-950/50'
          }`}
        >
          <div className="flex items-start gap-3">
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
              {message.parts.map((part, index) => {
                if (part.type === 'text' && part.content) {
                  return (
                    <div
                      key={`text-${index}`}
                      className="prose max-w-none text-white dark:prose-invert"
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[
                          rehypeRaw,
                          rehypeSanitize,
                          rehypeHighlight,
                        ]}
                      >
                        {part.content}
                      </ReactMarkdown>
                    </div>
                  )
                }

                if (
                  part.type === 'tool-call' &&
                  (part.name === 'inspectClientRuntimeContext' ||
                    part.name === 'inspectServerRuntimeContext')
                ) {
                  if (part.output === undefined) {
                    return (
                      <div
                        key={part.id}
                        className="mt-2 rounded-lg border border-orange-500/20 bg-gray-950/80 px-3 py-2 text-sm text-orange-200"
                      >
                        Running {part.name}
                      </div>
                    )
                  }

                  return (
                    <RuntimeContextToolResult
                      key={part.id}
                      name={part.name}
                      output={part.output}
                    />
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

function RuntimeContextExamplePage() {
  const [selectedModel, setSelectedModel] =
    useState<ModelOption>(DEFAULT_MODEL_OPTION)
  const [runtimeProfileIndex, setRuntimeProfileIndex] = useState(0)
  const [input, setInput] = useState('')
  const runtimeProfile =
    RUNTIME_PROFILES[runtimeProfileIndex] ?? RUNTIME_PROFILES[0]
  const runtimeContext = useMemo<ClientRuntimeContext>(
    () => ({
      userId: runtimeProfile.userId,
      tenantId: runtimeProfile.tenantId,
      loyaltyTier: runtimeProfile.loyaltyTier,
      preferredStyle: runtimeProfile.preferredStyle,
    }),
    [
      runtimeProfile.loyaltyTier,
      runtimeProfile.preferredStyle,
      runtimeProfile.tenantId,
      runtimeProfile.userId,
    ],
  )
  const forwardedProps = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
      runtimeUserId: runtimeContext.userId,
      runtimeTenantId: runtimeContext.tenantId,
      runtimeLoyaltyTier: runtimeContext.loyaltyTier,
      runtimePreferredStyle: runtimeContext.preferredStyle,
    }),
    [
      runtimeContext.loyaltyTier,
      runtimeContext.preferredStyle,
      runtimeContext.tenantId,
      runtimeContext.userId,
      selectedModel.model,
      selectedModel.provider,
    ],
  )
  const { messages, sendMessage, isLoading, error, stop } = useChat({
    id: 'runtime-context-example',
    connection: fetchServerSentEvents('/api/tanchat'),
    tools: runtimeContextTools,
    context: runtimeContext,
    forwardedProps,
  })

  const sendPrompt = (prompt: string) => {
    if (isLoading) return
    sendMessage(prompt)
  }

  const sendTypedMessage = () => {
    const prompt = input.trim()
    if (!prompt || isLoading) return
    sendMessage(prompt)
    setInput('')
  }

  return (
    <main className="flex h-[calc(100vh-72px)] flex-col bg-gray-950 text-white">
      <div className="border-b border-orange-500/15 bg-gray-900 px-4 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(220px,0.75fr)_minmax(220px,0.75fr)_minmax(0,1fr)] xl:items-end">
          <div>
            <label className="mb-2 block text-sm text-gray-400">
              Select Model:
            </label>
            <select
              value={MODEL_OPTIONS.findIndex(
                (option) =>
                  option.provider === selectedModel.provider &&
                  option.model === selectedModel.model,
              )}
              onChange={(event) => {
                const option = MODEL_OPTIONS[Number(event.target.value)]
                setSelectedModel(option)
              }}
              disabled={isLoading}
              className="w-full rounded-lg border border-orange-500/20 bg-gray-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
            >
              {MODEL_OPTIONS.map((option, index) => (
                <option key={option.label} value={index}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2 text-sm text-gray-400">
              <UserRound className="h-4 w-4 text-orange-400" />
              Runtime Context
            </label>
            <select
              value={runtimeProfileIndex}
              onChange={(event) =>
                setRuntimeProfileIndex(Number(event.target.value))
              }
              disabled={isLoading}
              className="w-full rounded-lg border border-orange-500/20 bg-gray-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
            >
              {RUNTIME_PROFILES.map((profile, index) => (
                <option key={profile.userId} value={index}>
                  {profile.label}
                </option>
              ))}
            </select>
            <div className="mt-1 truncate text-xs text-gray-500">
              {runtimeProfile.description}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button
              type="button"
              disabled={isLoading}
              onClick={() =>
                sendPrompt(
                  'Call inspectClientRuntimeContext and show the typed browser context.',
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-200 transition-colors hover:bg-orange-500/20 disabled:opacity-50"
            >
              <MonitorSmartphone className="h-4 w-4" />
              Client
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() =>
                sendPrompt(
                  'Call inspectServerRuntimeContext and show the typed server context.',
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-200 transition-colors hover:bg-orange-500/20 disabled:opacity-50"
            >
              <Server className="h-4 w-4" />
              Server
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() =>
                sendPrompt(
                  'Call inspectClientRuntimeContext and inspectServerRuntimeContext, then compare the contexts.',
                )
              }
              className="inline-flex items-center gap-2 rounded-lg border border-orange-500/25 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-200 transition-colors hover:bg-orange-500/20 disabled:opacity-50"
            >
              <BadgeCheck className="h-4 w-4" />
              Both
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-b border-orange-500/10 bg-gray-900/80 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 text-sm font-medium text-gray-300">
            Active Context
          </div>
          <RuntimeContextSummary profile={runtimeProfile} />
          <div className="mt-4 rounded-lg border border-gray-700/80 bg-gray-950/80 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-300">
              <Server className="h-4 w-4 text-orange-400" />
              Forwarded Props
            </div>
            <pre className="overflow-x-auto text-xs leading-5 text-gray-300">
              {JSON.stringify(forwardedProps, null, 2)}
            </pre>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1">
            <RuntimeMessages messages={messages} />
          </div>

          {error && (
            <div className="mx-4 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error.message}
            </div>
          )}

          <div className="border-t border-orange-500/10 bg-gray-900/90 p-4">
            {isLoading && (
              <div className="mb-3 flex justify-center">
                <button
                  type="button"
                  onClick={stop}
                  className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
                >
                  <Square className="h-4 w-4 fill-current" />
                  Stop
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={isLoading}
                rows={1}
                placeholder="Ask for client context, server context, or both..."
                className="max-h-40 min-h-11 flex-1 resize-none overflow-hidden rounded-lg border border-orange-500/20 bg-gray-800/70 px-4 py-3 text-sm text-white shadow-lg placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
                onInput={(event) => {
                  const target = event.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height =
                    Math.min(target.scrollHeight, 160) + 'px'
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    input.trim()
                  ) {
                    event.preventDefault()
                    sendTypedMessage()
                  }
                }}
              />
              <button
                type="button"
                onClick={sendTypedMessage}
                disabled={!input.trim() || isLoading}
                className="rounded-lg p-3 text-orange-400 transition-colors hover:text-orange-300 disabled:text-gray-600"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

export const Route = createFileRoute('/example/runtime-context')({
  component: RuntimeContextExamplePage,
})
