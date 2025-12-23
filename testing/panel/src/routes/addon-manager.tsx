import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  Check,
  Loader2,
  Package,
  Send,
  Square,
  X,
  CreditCard,
  Database,
  Paintbrush,
  LayoutGrid,
  AlertTriangle,
  BarChart3,
  Shield,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import type { UIMessage } from '@tanstack/ai-react'
import {
  availableAddOns,
  getAvailableAddOnsToolDef,
  selectAddOnsToolDef,
  unselectAddOnsToolDef,
} from '@/lib/addon-tools'

// Type for add-on state
interface AddOnState {
  selected: boolean
  enabled: boolean
}

// Icons for different add-on types
const typeIcons: Record<string, React.ReactNode> = {
  authentication: <Shield className="w-4 h-4" />,
  payments: <CreditCard className="w-4 h-4" />,
  database: <Database className="w-4 h-4" />,
  styling: <Paintbrush className="w-4 h-4" />,
  'ui-components': <LayoutGrid className="w-4 h-4" />,
  monitoring: <AlertTriangle className="w-4 h-4" />,
  analytics: <BarChart3 className="w-4 h-4" />,
}

function AddOnCard({
  addOn,
  state,
  onToggle,
}: {
  addOn: (typeof availableAddOns)[0]
  state: AddOnState
  onToggle: () => void
}) {
  const Icon = typeIcons[addOn.type] || <Package className="w-4 h-4" />

  return (
    <div
      className={`p-4 rounded-lg border transition-all ${
        state.selected
          ? 'border-green-500 bg-green-500/10'
          : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
      } ${!state.enabled ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg ${state.selected ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}
        >
          {Icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-white truncate">{addOn.name}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
              {addOn.type}
            </span>
          </div>
          <p className="text-sm text-gray-400 mt-1 line-clamp-2">
            {addOn.description}
          </p>
        </div>
        <button
          onClick={onToggle}
          disabled={!state.enabled}
          className={`p-2 rounded-lg transition-colors ${
            state.selected
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {state.selected ? (
            <Check className="w-4 h-4" />
          ) : (
            <X className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  )
}

function AddOnPanel({
  addOnState,
  onToggle,
}: {
  addOnState: Record<string, AddOnState>
  onToggle: (id: string) => void
}) {
  const selectedCount = Object.values(addOnState).filter(
    (s) => s.selected,
  ).length

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Package className="w-5 h-5 text-orange-500" />
          Project Add-ons
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          {selectedCount} of {availableAddOns.length} add-ons selected
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {availableAddOns.map((addOn) => (
          <AddOnCard
            key={addOn.id}
            addOn={addOn}
            state={addOnState[addOn.id] || { selected: false, enabled: true }}
            onToggle={() => onToggle(addOn.id)}
          />
        ))}
      </div>
    </div>
  )
}

function Messages({ messages }: { messages: Array<UIMessage> }) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  if (!messages.length) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>Ask the AI to configure your add-ons</p>
          <p className="text-sm mt-2">
            Try: "Add authentication and payments" or "Show me what's available"
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
      {messages.map(({ id, role, parts }) => (
        <div
          key={id}
          className={`p-4 rounded-lg mb-2 ${
            role === 'assistant'
              ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
              : 'bg-transparent'
          }`}
        >
          <div className="flex items-start gap-4">
            {role === 'assistant' ? (
              <div className="w-8 h-8 rounded-lg bg-linear-to-r from-orange-500 to-red-600 flex items-center justify-center text-sm font-medium text-white shrink-0">
                AI
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-medium text-white shrink-0">
                U
              </div>
            )}
            <div className="flex-1 min-w-0">
              {parts.map((part, index) => {
                if (part.type === 'text' && part.content) {
                  return (
                    <div
                      key={`text-${index}`}
                      className="text-white prose dark:prose-invert max-w-none"
                    >
                      <ReactMarkdown
                        rehypePlugins={[rehypeRaw, rehypeSanitize]}
                      >
                        {part.content}
                      </ReactMarkdown>
                    </div>
                  )
                }

                // Show tool call status
                if (part.type === 'tool-call') {
                  return (
                    <div
                      key={part.id}
                      className="mt-2 p-3 bg-gray-800 rounded-lg border border-gray-700"
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400">Tool:</span>
                        <span className="text-orange-400 font-mono">
                          {part.name}
                        </span>
                        {part.state === 'input-streaming' && (
                          <Loader2 className="w-3 h-3 animate-spin text-orange-500" />
                        )}
                        {part.output !== undefined && (
                          <Check className="w-3 h-3 text-green-500" />
                        )}
                      </div>
                      {part.output !== undefined && (
                        <div className="mt-2 text-xs text-gray-500 font-mono overflow-x-auto">
                          <pre>
                            {JSON.stringify(part.output, null, 2).slice(0, 200)}
                            {JSON.stringify(part.output).length > 200
                              ? '...'
                              : ''}
                          </pre>
                        </div>
                      )}
                    </div>
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

function DebugPanel({
  messages,
  chunks,
  onClearChunks,
}: {
  messages: Array<UIMessage>
  chunks: Array<any>
  onClearChunks: () => void
}) {
  const [activeTab, setActiveTab] = useState<'messages' | 'chunks'>('chunks')

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-orange-500/20">
        <h2 className="text-white font-semibold text-lg">Debug Panel</h2>
        <p className="text-gray-400 text-sm mt-1">
          Monitor multi-tool execution
        </p>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setActiveTab('messages')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'messages'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Messages
          </button>
          <button
            onClick={() => setActiveTab('chunks')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'chunks'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Raw Chunks ({chunks.length})
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'messages' && (
          <pre className="text-xs text-gray-300 font-mono bg-gray-800 p-4 rounded-lg overflow-x-auto">
            {JSON.stringify(messages, null, 2)}
          </pre>
        )}

        {activeTab === 'chunks' && (
          <div className="space-y-4">
            <button
              onClick={onClearChunks}
              disabled={chunks.length === 0}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              🗑️ Clear Chunks
            </button>

            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-900 text-gray-400 uppercase">
                  <tr>
                    <th className="px-4 py-3 w-24">Type</th>
                    <th className="px-4 py-3 w-32">Tool Name</th>
                    <th className="px-4 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {chunks.map((chunk, idx) => {
                    const toolName =
                      chunk.toolCall?.function?.name || chunk.toolName || '-'

                    let detail = '-'
                    if (chunk.type === 'content' && chunk.content) {
                      detail = chunk.content
                    } else if (
                      chunk.type === 'tool_call' &&
                      chunk.toolCall?.function?.arguments
                    ) {
                      detail = chunk.toolCall.function.arguments
                    } else if (chunk.type === 'tool_result' && chunk.content) {
                      detail = chunk.content
                    } else if (chunk.type === 'tool-input-available') {
                      detail = JSON.stringify(chunk.input)
                    } else if (chunk.type === 'done') {
                      detail = `Finish: ${chunk.finishReason || 'unknown'}`
                    }

                    if (detail.length > 100) {
                      detail = detail.substring(0, 100) + '...'
                    }

                    return (
                      <tr
                        key={idx}
                        className="border-b border-gray-700 hover:bg-gray-750"
                      >
                        <td className="px-4 py-3 font-medium">{chunk.type}</td>
                        <td className="px-4 py-3">{toolName}</td>
                        <td className="px-4 py-3 font-mono text-xs break-all">
                          {detail}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AddonManagerPage() {
  const [chunks, setChunks] = useState<Array<any>>([])
  const [input, setInput] = useState('')

  // Initialize add-on state
  const [addOnState, setAddOnState] = useState<Record<string, AddOnState>>(
    () => {
      const initial: Record<string, AddOnState> = {}
      for (const addOn of availableAddOns) {
        initial[addOn.id] = { selected: false, enabled: true }
      }
      return initial
    },
  )

  // Toggle add-on selection (for manual UI interaction)
  const toggleAddOn = useCallback((id: string) => {
    setAddOnState((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        selected: !prev[id]?.selected,
      },
    }))
  }, [])

  // Client tool 1: Returns current add-on state
  const getAvailableAddOnsClient = useMemo(
    () =>
      getAvailableAddOnsToolDef.client(() => {
        console.log('[Client Tool] getAvailableAddOns called')
        return availableAddOns.map((addOn) => ({
          id: addOn.id,
          name: addOn.name,
          description: addOn.description,
          type: addOn.type,
          selected: addOnState[addOn.id]?.selected ?? false,
          enabled: addOnState[addOn.id]?.enabled ?? true,
        }))
      }),
    [addOnState],
  )

  // Client tool 2: Selects add-ons
  const selectAddOnsClient = useMemo(
    () =>
      selectAddOnsToolDef.client((args) => {
        console.log('[Client Tool] selectAddOns called with:', args)

        // Calculate what will be selected BEFORE calling setState
        // (setState callback is async, so we can't read results from it)
        const toSelect: string[] = []
        for (const addOnId of args.addOnIds) {
          const state = addOnState[addOnId]
          if (state && !state.selected && state.enabled) {
            toSelect.push(addOnId)
          }
        }

        // Update state if there's anything to select
        if (toSelect.length > 0) {
          setAddOnState((prev) => {
            const next = { ...prev }
            for (const addOnId of toSelect) {
              next[addOnId] = { ...next[addOnId], selected: true }
            }
            return next
          })
        }

        return {
          success: toSelect.length > 0,
          selectedAddOns: toSelect,
          message:
            toSelect.length > 0
              ? `Successfully selected: ${toSelect.join(', ')}`
              : 'No add-ons were selected (may already be selected or not found).',
        }
      }),
    [addOnState],
  )

  // Client tool 3: Unselects add-ons
  const unselectAddOnsClient = useMemo(
    () =>
      unselectAddOnsToolDef.client((args) => {
        console.log('[Client Tool] unselectAddOns called with:', args)

        // Calculate what will be unselected BEFORE calling setState
        // (setState callback is async, so we can't read results from it)
        const toUnselect: string[] = []
        for (const addOnId of args.addOnIds) {
          const state = addOnState[addOnId]
          if (state && state.selected && state.enabled) {
            toUnselect.push(addOnId)
          }
        }

        // Update state if there's anything to unselect
        if (toUnselect.length > 0) {
          setAddOnState((prev) => {
            const next = { ...prev }
            for (const addOnId of toUnselect) {
              next[addOnId] = { ...next[addOnId], selected: false }
            }
            return next
          })
        }

        return {
          success: toUnselect.length > 0,
          unselectedAddOns: toUnselect,
          message:
            toUnselect.length > 0
              ? `Successfully unselected: ${toUnselect.join(', ')}`
              : 'No add-ons were unselected (may not be selected or not found).',
        }
      }),
    [addOnState],
  )

  // Combine client tools
  const tools = useMemo(
    () =>
      clientTools(
        getAvailableAddOnsClient,
        selectAddOnsClient,
        unselectAddOnsClient,
      ),
    [getAvailableAddOnsClient, selectAddOnsClient, unselectAddOnsClient],
  )

  const { messages, sendMessage, isLoading, stop } = useChat({
    connection: fetchServerSentEvents('/api/addon-chat'),
    tools,
    onChunk: (chunk: any) => {
      setChunks((prev) => [...prev, chunk])
    },
  })

  const clearChunks = () => setChunks([])

  return (
    <div className="flex h-[calc(100vh-72px)] bg-gray-900">
      {/* Left side - Add-on Selection Panel (1/4 width) */}
      <div className="w-1/4 border-r border-gray-700 bg-gray-900">
        <AddOnPanel addOnState={addOnState} onToggle={toggleAddOn} />
      </div>

      {/* Middle - Chat (1/2 width) */}
      <div className="w-1/2 flex flex-col border-r border-orange-500/20">
        <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
          <h2 className="text-white font-semibold">AI Add-on Assistant</h2>
          <p className="text-sm text-gray-400">
            Ask me to configure your project add-ons
          </p>
        </div>

        <Messages messages={messages} />

        <div className="border-t border-orange-500/10 bg-gray-900/80 backdrop-blur-sm p-4">
          {isLoading && (
            <div className="flex items-center justify-center mb-3">
              <button
                onClick={stop}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop
              </button>
            </div>
          )}
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me to add or remove add-ons..."
              className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
              rows={2}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                  e.preventDefault()
                  sendMessage(input)
                  setInput('')
                }
              }}
            />
            <button
              onClick={() => {
                if (input.trim()) {
                  sendMessage(input)
                  setInput('')
                }
              }}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 bottom-2 p-2 text-orange-500 hover:text-orange-400 disabled:text-gray-500 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right side - Debug Panel (1/4 width) */}
      <div className="w-1/4 bg-gray-950 flex flex-col">
        <DebugPanel
          messages={messages}
          chunks={chunks}
          onClearChunks={clearChunks}
        />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/addon-manager')({
  component: AddonManagerPage,
})
