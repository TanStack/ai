import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Mic, MicOff, Send, Square, Volume2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import { ThinkingPart } from '@tanstack/ai-react-ui'

import type { UIMessage } from '@tanstack/ai-react'

import type { ModelOption } from '@/lib/model-selection'

import GuitarRecommendation from '@/components/example-GuitarRecommendation'
import {
  addToCartToolDef,
  addToWishListToolDef,
  getPersonalGuitarPreferenceToolDef,
  recommendGuitarToolDef,
} from '@/lib/guitar-tools'

import { MODEL_OPTIONS, getDefaultModelOption } from '@/lib/model-selection'

import './tanchat.css'

import { useAudioRecorder, useTTS } from '@/hooks'

const getPersonalGuitarPreferenceToolClient =
  getPersonalGuitarPreferenceToolDef.client(() => ({ preference: 'acoustic' }))

const addToWishListToolClient = addToWishListToolDef.client((args) => {
  const wishList = JSON.parse(localStorage.getItem('wishList') || '[]')
  wishList.push(args.guitarId)
  localStorage.setItem('wishList', JSON.stringify(wishList))
  return {
    success: true,
    guitarId: args.guitarId,
    totalItems: wishList.length,
  }
})

const addToCartToolClient = addToCartToolDef.client((args) => ({
  success: true,
  cartId: 'CART_CLIENT_' + Date.now(),
  guitarId: args.guitarId,
  quantity: args.quantity,
  totalItems: args.quantity,
}))

const recommendGuitarToolClient = recommendGuitarToolDef.client(({ id }) => ({
  id: +id,
}))

const tools = clientTools(
  getPersonalGuitarPreferenceToolClient,
  addToWishListToolClient,
  addToCartToolClient,
  recommendGuitarToolClient,
)

function ChatInputArea({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-orange-500/10 bg-gray-900/80 backdrop-blur-sm">
      <div className="w-full px-4 py-3">{children}</div>
    </div>
  )
}

function Messages({
  messages,
  addToolApprovalResponse,
  playingId,
  onSpeak,
  onStopSpeaking,
}: {
  messages: Array<UIMessage>
  addToolApprovalResponse: (response: {
    id: string
    approved: boolean
  }) => Promise<void>
  playingId: string | null
  onSpeak: (text: string, id: string) => void
  onStopSpeaking: () => void
}) {
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop =
        messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  if (!messages.length) {
    return null
  }

  // Extract text content from a message for TTS
  const getMessageText = (parts: UIMessage['parts']): string => {
    return parts
      .filter((part) => part.type === 'text' && part.content)
      .map((part) => (part as { type: 'text'; content: string }).content)
      .join(' ')
  }

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      {messages.map(({ id, role, parts }) => {
        const messageText = role === 'assistant' ? getMessageText(parts) : ''
        const isPlaying = playingId === id

        return (
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
                {/* Render parts in order */}
                {parts.map((part, index) => {
                  // Thinking part
                  if (part.type === 'thinking') {
                    // Check if thinking is complete (if there's a text part after)
                    const isComplete = parts
                      .slice(index + 1)
                      .some((p) => p.type === 'text')
                    return (
                      <div key={`thinking-${index}`} className="mt-2 mb-2">
                        <ThinkingPart
                          content={part.content}
                          isComplete={isComplete}
                          className="p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg"
                        />
                      </div>
                    )
                  }

                  if (part.type === 'text' && part.content) {
                    return (
                      <div
                        key={`text-${index}`}
                        className="text-white prose dark:prose-invert max-w-none"
                      >
                        <ReactMarkdown
                          rehypePlugins={[
                            rehypeRaw,
                            rehypeSanitize,
                            rehypeHighlight,
                            remarkGfm,
                          ]}
                        >
                          {part.content}
                        </ReactMarkdown>
                      </div>
                    )
                  }

                  // Approval UI
                  if (
                    part.type === 'tool-call' &&
                    part.state === 'approval-requested' &&
                    part.approval
                  ) {
                    return (
                      <div
                        key={part.id}
                        className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mt-2"
                      >
                        <p className="text-white font-medium mb-2">
                          🔒 Approval Required: {part.name}
                        </p>
                        <div className="text-gray-300 text-sm mb-3">
                          <pre className="bg-gray-800 p-2 rounded text-xs overflow-x-auto">
                            {JSON.stringify(
                              JSON.parse(part.arguments),
                              null,
                              2,
                            )}
                          </pre>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              addToolApprovalResponse({
                                id: part.approval!.id,
                                approved: true,
                              })
                            }
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() =>
                              addToolApprovalResponse({
                                id: part.approval!.id,
                                approved: false,
                              })
                            }
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
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
                        <div key={part.id} className="mt-2">
                          <GuitarRecommendation id={part.output.id} />
                        </div>
                      )
                    } catch {
                      return null
                    }
                  }

                  return null
                })}
              </div>
              {/* Speaker button for assistant messages */}
              {role === 'assistant' && messageText && (
                <button
                  onClick={() => {
                    if (isPlaying) {
                      onStopSpeaking()
                    } else {
                      onSpeak(messageText, id)
                    }
                  }}
                  className={`shrink-0 p-2 rounded-lg transition-colors ${
                    isPlaying
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-400 hover:text-orange-400 hover:bg-gray-800'
                  }`}
                  title={isPlaying ? 'Stop speaking' : 'Read aloud'}
                >
                  {isPlaying ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
              )}
            </div>
          </div>
        )
      })}
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
  const [activeTab, setActiveTab] = useState<'messages' | 'chunks'>('messages')

  const exportToTypeScript = () => {
    const tsCode = `const rawChunks = ${JSON.stringify(chunks, null, 2)};`
    navigator.clipboard.writeText(tsCode)
    alert('TypeScript code copied to clipboard!')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-orange-500/20">
        <h2 className="text-white font-semibold text-lg">Debug Panel</h2>
        <p className="text-gray-400 text-sm mt-1">
          View messages and raw stream chunks
        </p>

        {/* Tabs */}
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
          <div>
            <pre className="text-xs text-gray-300 font-mono bg-gray-800 p-4 rounded-lg overflow-x-auto">
              {JSON.stringify(messages, null, 2)}
            </pre>
          </div>
        )}

        {activeTab === 'chunks' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={exportToTypeScript}
                disabled={chunks.length === 0}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                📋 Export to TypeScript
              </button>
              <button
                onClick={onClearChunks}
                disabled={chunks.length === 0}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                🗑️ Clear Chunks
              </button>
            </div>

            {/* Chunks Table */}
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-gray-900 text-gray-400 uppercase">
                  <tr>
                    <th className="px-4 py-3 w-32">Type</th>
                    <th className="px-4 py-3 w-24">Role</th>
                    <th className="px-4 py-3 w-24">Tool Type</th>
                    <th className="px-4 py-3 w-32">Tool Name</th>
                    <th className="px-4 py-3">Detail</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {chunks.map((chunk, idx) => {
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
                    } else if (chunk.type === 'tool_result' && chunk.content) {
                      detail = chunk.content
                    } else if (chunk.type === 'done') {
                      detail = `Finish: ${chunk.finishReason || 'unknown'}`
                    }

                    // Truncate at 200 chars
                    if (detail.length > 200) {
                      detail = detail.substring(0, 200) + '...'
                    }

                    return (
                      <tr
                        key={idx}
                        className="border-b border-gray-700 hover:bg-gray-750"
                      >
                        <td className="px-4 py-3 font-medium">{chunk.type}</td>
                        <td className="px-4 py-3">{role}</td>
                        <td className="px-4 py-3">{toolType}</td>
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

function ChatPage() {
  const [chunks, setChunks] = useState<Array<any>>([])
  const [selectedModel, setSelectedModel] = useState<ModelOption>(() =>
    getDefaultModelOption(),
  )

  // Audio hooks
  const { isRecording, isTranscribing, startRecording, stopRecording } =
    useAudioRecorder()
  const { playingId, speak, stop: stopSpeaking } = useTTS()

  // Generate trace ID on mount: chat_YYMMDD_HHMMSS
  const [traceId] = useState(() => {
    const now = new Date()
    const year = String(now.getFullYear()).slice(-2)
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    return `chat_${year}${month}${day}_${hours}${minutes}${seconds}`
  })

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
      traceId,
    }),
    [selectedModel.provider, selectedModel.model, traceId],
  )

  const { messages, sendMessage, isLoading, addToolApprovalResponse, stop } =
    useChat({
      connection: fetchServerSentEvents('/api/chat'),
      tools,
      onChunk: (chunk: any) => {
        setChunks((prev) => [...prev, chunk])
      },
      body,
    })
  const [input, setInput] = useState('')

  const clearChunks = () => setChunks([])

  // Handle microphone toggle
  const handleMicToggle = async () => {
    if (isRecording) {
      const transcribedText = await stopRecording()
      if (transcribedText) {
        setInput((prev) =>
          prev ? `${prev} ${transcribedText}` : transcribedText,
        )
      }
    } else {
      await startRecording()
    }
  }

  return (
    <div className="flex h-[calc(100vh-72px)] bg-gray-900">
      {/* Left side - Chat (1/2 width) */}
      <div className="w-1/2 flex flex-col border-r border-orange-500/20">
        {/* Model selector bar */}
        <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-sm text-gray-400 mb-2 block">
                Select Model:
              </label>
              <select
                value={MODEL_OPTIONS.findIndex(
                  (opt) =>
                    opt.provider === selectedModel.provider &&
                    opt.model === selectedModel.model,
                )}
                onChange={(e) => {
                  const option = MODEL_OPTIONS[parseInt(e.target.value)]
                  setSelectedModel(option)
                }}
                disabled={isLoading}
                className="w-full rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
              >
                {MODEL_OPTIONS.map((option, index) => (
                  <option key={index} value={index}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <a
              href={`/stream-debugger?trace=${traceId}`}
              className="shrink-0 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Debug Trace
            </a>
          </div>
        </div>

        <Messages
          messages={messages}
          addToolApprovalResponse={addToolApprovalResponse}
          playingId={playingId}
          onSpeak={speak}
          onStopSpeaking={stopSpeaking}
        />

        <ChatInputArea>
          <div className="space-y-3">
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
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isRecording
                    ? 'Recording... Click mic to stop'
                    : isTranscribing
                      ? 'Transcribing...'
                      : "Type something clever (or don't, we won't judge)..."
                }
                className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 pl-4 pr-24 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
                rows={1}
                style={{ minHeight: '44px', maxHeight: '200px' }}
                disabled={isLoading || isRecording || isTranscribing}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height =
                    Math.min(target.scrollHeight, 200) + 'px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                    e.preventDefault()
                    sendMessage(input)
                    setInput('')
                  }
                }}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {/* Microphone button */}
                <button
                  onClick={handleMicToggle}
                  disabled={isLoading || isTranscribing}
                  className={`p-2 transition-colors focus:outline-none rounded-lg ${
                    isRecording
                      ? 'text-red-500 bg-red-500/20 animate-pulse'
                      : isTranscribing
                        ? 'text-orange-400'
                        : 'text-gray-400 hover:text-orange-400 hover:bg-gray-700'
                  } disabled:opacity-50`}
                  title={
                    isRecording
                      ? 'Stop recording'
                      : isTranscribing
                        ? 'Transcribing...'
                        : 'Start voice input'
                  }
                >
                  {isTranscribing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="w-4 h-4" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
                {/* Send button */}
                <button
                  onClick={() => {
                    if (input.trim()) {
                      sendMessage(input)
                      setInput('')
                    }
                  }}
                  disabled={
                    !input.trim() || isLoading || isRecording || isTranscribing
                  }
                  className="p-2 text-orange-500 hover:text-orange-400 disabled:text-gray-500 transition-colors focus:outline-none"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </ChatInputArea>
      </div>

      <div className="w-1/2 bg-gray-950 flex flex-col">
        <DebugPanel
          messages={messages}
          chunks={chunks}
          onClearChunks={clearChunks}
        />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
