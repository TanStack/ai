import { createFileRoute } from '@tanstack/solid-router'
import Send from 'lucide-solid/icons/send'
import Square from 'lucide-solid/icons/square'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-solid'
import { ThinkingPart, TextPart } from '@tanstack/ai-solid-ui'
import { createSignal, For } from 'solid-js'
import type { UIMessage } from '@tanstack/ai-solid'
import type { JSXElement } from 'solid-js'
import GuitarRecommendation from '@/components/example-GuitarRecommendation'

function ChatInputArea(props: { children: JSXElement }) {
  return (
    <div class="border-t border-orange-500/10 bg-gray-900/80 backdrop-blur-sm">
      <div class="w-full px-4 py-3">{props.children}</div>
    </div>
  )
}

function Messages(props: {
  messages: Array<UIMessage>
  addToolApprovalResponse: (response: {
    id: string
    approved: boolean
  }) => Promise<void>
}) {
  return (
    <div class="flex-1 overflow-y-auto px-4 py-4">
      <For each={props.messages}>
        {({ role, parts }) => (
          <div
            class={`p-4 rounded-lg mb-2 ${
              role === 'assistant'
                ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
                : 'bg-transparent'
            }`}
          >
            <div class="flex items-start gap-4">
              {role === 'assistant' ? (
                <div class="w-8 h-8 rounded-lg bg-linear-to-r from-orange-500 to-red-600 flex items-center justify-center text-sm font-medium text-white shrink-0">
                  AI
                </div>
              ) : (
                <div class="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center text-sm font-medium text-white shrink-0">
                  U
                </div>
              )}
              <div class="flex-1 min-w-0">
                {/* Render parts in order */}
                <For each={parts}>
                  {(part, index) => {
                    // Thinking part
                    if (part.type === 'thinking') {
                      // Check if thinking is complete (if there's a text part after)
                      const isComplete = parts
                        .slice(index() + 1)
                        .some((p) => p.type === 'text')
                      return (
                        <div class="mt-2 mb-2">
                          <ThinkingPart
                            content={part.content}
                            isComplete={isComplete}
                            class="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg"
                          />
                        </div>
                      )
                    }

                    if (part.type === 'text' && part.content) {
                      return (
                        <TextPart
                          content={part.content}
                          role={role}
                          class="text-white prose dark:prose-invert max-w-none"
                        />
                      )
                    }

                    // Approval UI
                    if (
                      part.type === 'tool-call' &&
                      part.state === 'approval-requested' &&
                      part.approval
                    ) {
                      return (
                        <div class="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mt-2">
                          <p class="text-white font-medium mb-2">
                            🔒 Approval Required: {part.name}
                          </p>
                          <div class="text-gray-300 text-sm mb-3">
                            <pre class="bg-gray-800 p-2 rounded text-xs overflow-x-auto">
                              {JSON.stringify(
                                JSON.parse(part.arguments),
                                null,
                                2,
                              )}
                            </pre>
                          </div>
                          <div class="flex gap-2">
                            <button
                              onClick={() =>
                                props.addToolApprovalResponse({
                                  id: part.approval!.id,
                                  approved: true,
                                })
                              }
                              class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() =>
                                props.addToolApprovalResponse({
                                  id: part.approval!.id,
                                  approved: false,
                                })
                              }
                              class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              ✗ Deny
                            </button>
                          </div>
                        </div>
                      )
                    }

                    // Guitar recommendation card
                    if (
                      part.type === 'tool-call' &&
                      part.name === 'recommendGuitar' &&
                      part.output
                    ) {
                      try {
                        return (
                          <div class="mt-2">
                            <GuitarRecommendation id={part.output.id} />
                          </div>
                        )
                      } catch {
                        return null
                      }
                    }

                    return null
                  }}
                </For>
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  )
}

function DebugPanel(props: {
  messages: Array<UIMessage>
  chunks: Array<any>
  onClearChunks: () => void
}) {
  const [activeTab, setActiveTab] = createSignal<'messages' | 'chunks'>(
    'messages',
  )

  const exportToTypeScript = () => {
    const tsCode = `const rawChunks = ${JSON.stringify(props.chunks, null, 2)};`
    navigator.clipboard.writeText(tsCode)
    alert('TypeScript code copied to clipboard!')
  }

  return (
    <div class="flex flex-col h-full">
      <div class="p-4 border-b border-orange-500/20">
        <h2 class="text-white font-semibold text-lg">Debug Panel</h2>
        <p class="text-gray-400 text-sm mt-1">
          View messages and raw stream chunks
        </p>

        {/* Tabs */}
        <div class="flex gap-2 mt-4">
          <button
            onClick={() => setActiveTab('messages')}
            class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab() === 'messages'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Messages
          </button>
          <button
            onClick={() => setActiveTab('chunks')}
            class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab() === 'chunks'
                ? 'bg-orange-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            Raw Chunks ({props.chunks.length})
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        {activeTab() === 'messages' && (
          <div>
            <pre class="text-xs text-gray-300 font-mono bg-gray-800 p-4 rounded-lg overflow-x-auto">
              {JSON.stringify(props.messages, null, 2)}
            </pre>
          </div>
        )}

        {activeTab() === 'chunks' && (
          <div class="space-y-4">
            <div class="flex gap-2">
              <button
                onClick={exportToTypeScript}
                disabled={props.chunks.length === 0}
                class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                📋 Export to TypeScript
              </button>
              <button
                onClick={props.onClearChunks}
                disabled={props.chunks.length === 0}
                class="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                🗑️ Clear Chunks
              </button>
            </div>

            {/* Chunks Table */}
            <div class="bg-gray-800 rounded-lg overflow-hidden">
              <table class="w-full text-xs text-left">
                <thead class="bg-gray-900 text-gray-400 uppercase">
                  <tr>
                    <th class="px-4 py-3 w-32">Type</th>
                    <th class="px-4 py-3 w-24">Role</th>
                    <th class="px-4 py-3 w-24">Tool Type</th>
                    <th class="px-4 py-3 w-32">Tool Name</th>
                    <th class="px-4 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody class="text-gray-300">
                  <For each={props.chunks}>
                    {(chunk) => {
                      const role = chunk.role || '-'
                      const toolType = chunk.toolCall?.type || '-'
                      const toolName = chunk.toolCall?.function?.name || '-'

                      let detail = '-'
                      if (chunk.type === 'content' && chunk.content) {
                        detail = chunk.content
                      } else if (
                        chunk.type === 'tool_call' &&
                        chunk.toolCall?.function?.arguments
                      ) {
                        detail = chunk.toolCall.function.arguments
                      } else if (
                        chunk.type === 'tool_result' &&
                        chunk.content
                      ) {
                        detail = chunk.content
                      } else if (chunk.type === 'done') {
                        detail = `Finish: ${chunk.finishReason || 'unknown'}`
                      }

                      // Truncate at 200 chars
                      if (detail.length > 200) {
                        detail = detail.substring(0, 200) + '...'
                      }

                      return (
                        <tr class="border-b border-gray-700 hover:bg-gray-750">
                          <td class="px-4 py-3 font-medium">{chunk.type}</td>
                          <td class="px-4 py-3">{role}</td>
                          <td class="px-4 py-3">{toolType}</td>
                          <td class="px-4 py-3">{toolName}</td>
                          <td class="px-4 py-3 font-mono text-xs break-all">
                            {detail}
                          </td>
                        </tr>
                      )
                    }}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ChatPage() {
  const [chunks, setChunks] = createSignal<Array<any>>([])

  const { messages, sendMessage, isLoading, addToolApprovalResponse, stop } =
    useChat({
      connection: fetchServerSentEvents('/api/tanchat'),
      onChunk: (chunk: any) => {
        setChunks((prev) => [...prev, chunk])
      },
      onToolCall: async ({ toolName, input }) => {
        // Handle client-side tool execution
        switch (toolName) {
          case 'getPersonalGuitarPreference':
            // Pure client tool - executes immediately
            return { preference: 'acoustic' }

          case 'recommendGuitar':
            // Client tool for UI display
            return { id: input.id }

          case 'addToWishList':
            // Hybrid: client execution AFTER approval
            // Only runs after user approves
            const wishList = JSON.parse(
              localStorage.getItem('wishList') || '[]',
            )
            wishList.push(input.guitarId)
            localStorage.setItem('wishList', JSON.stringify(wishList))
            return {
              success: true,
              guitarId: input.guitarId,
              totalItems: wishList.length,
            }

          default:
            throw new Error(`Unknown client tool: ${toolName}`)
        }
      },
    })
  const [input, setInput] = createSignal('')

  const clearChunks = () => setChunks([])

  return (
    <div class="flex h-[calc(100vh-72px)]  bg-gray-900">
      {/* Left side - Chat (1/4 width) */}
      <div class="w-1/4 flex flex-col border-r border-orange-500/20">
        <div class="p-4 border-b border-orange-500/20">
          <h1 class="text-2xl font-bold bg-linear-to-r from-orange-500 to-red-600 text-transparent bg-clip-text">
            TanStack Chat
          </h1>
          <p class="text-gray-400 text-sm mt-1">
            Parts-based UIMessages with tool states
          </p>
        </div>

        <Messages
          messages={messages()}
          addToolApprovalResponse={addToolApprovalResponse}
        />

        <ChatInputArea>
          <div class="space-y-3">
            {isLoading() && (
              <div class="flex items-center justify-center">
                <button
                  onClick={stop}
                  class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Square class="w-4 h-4 fill-current" />
                  Stop
                </button>
              </div>
            )}
            <div class="relative">
              <textarea
                value={input()}
                placeholder="Type something clever (or don't, we won't judge)..."
                class="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
                rows={1}
                style={{ 'min-height': '44px', 'max-height': '200px' }}
                disabled={isLoading()}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height =
                    Math.min(target.scrollHeight, 200) + 'px'
                  setInput(target.value)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && input().trim()) {
                    e.preventDefault()
                    sendMessage(input())
                    setInput('')
                  }
                }}
              />
              <button
                onClick={() => {
                  if (input().trim()) {
                    sendMessage(input())
                    setInput('')
                  }
                }}
                disabled={!input().trim() || isLoading()}
                class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-500 hover:text-orange-400 disabled:text-gray-500 transition-colors focus:outline-none"
              >
                <Send class="w-4 h-4" />
              </button>
            </div>
          </div>
        </ChatInputArea>
      </div>

      {/* Right side - Debug Panel (3/4 width) */}
      <div class="w-3/4 bg-gray-950 flex flex-col">
        <DebugPanel
          messages={messages()}
          chunks={chunks()}
          onClearChunks={clearChunks}
        />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
