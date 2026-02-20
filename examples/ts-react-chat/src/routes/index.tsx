import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ImagePlus, Send, Square, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'
import { clientTools } from '@tanstack/ai-client'
import { ThinkingPart } from '@tanstack/ai-react-ui'
import type { UIMessage } from '@tanstack/ai-react'
import type { ContentPart } from '@tanstack/ai'
import type { ModelOption } from '@/lib/model-selection'
import GuitarRecommendation from '@/components/example-GuitarRecommendation'
import {
  addToCartToolDef,
  addToWishListToolDef,
  getPersonalGuitarPreferenceToolDef,
  recommendGuitarToolDef,
} from '@/lib/guitar-tools'
import { DEFAULT_MODEL_OPTION, MODEL_OPTIONS } from '@/lib/model-selection'

/**
 * Generate a random message ID
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

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
}: {
  messages: Array<UIMessage>
  addToolApprovalResponse: (response: {
    id: string
    approved: boolean
  }) => Promise<void>
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

  return (
    <div
      ref={messagesContainerRef}
      className="flex-1 overflow-y-auto px-4 py-4"
    >
      {messages.map((message) => {
        return (
          <div
            key={message.id}
            className={`p-4 rounded-lg mb-2 ${
              message.role === 'assistant'
                ? 'bg-linear-to-r from-orange-500/5 to-red-600/5'
                : 'bg-transparent'
            }`}
          >
            <div className="flex items-start gap-4">
              {message.role === 'assistant' ? (
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
                {message.parts.map((part, index) => {
                  if (part.type === 'thinking') {
                    // Check if thinking is complete (if there's a text part after)
                    const isComplete = message.parts
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

                  // Render image parts
                  if (part.type === 'image') {
                    const imageUrl =
                      part.source.type === 'url'
                        ? part.source.value
                        : `data:image/png;base64,${part.source.value}`
                    return (
                      <div key={`image-${index}`} className="mt-2 mb-2">
                        <img
                          src={imageUrl}
                          alt="Attached image"
                          className="max-w-md rounded-lg border border-gray-700"
                        />
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
                    return (
                      <div key={part.id} className="mt-2">
                        <GuitarRecommendation id={part.output?.id} />
                      </div>
                    )
                  }

                  return null
                })}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ChatPage() {
  const [selectedModel, setSelectedModel] =
    useState<ModelOption>(DEFAULT_MODEL_OPTION)
  const [attachedImages, setAttachedImages] = useState<
    Array<{ id: string; base64: string; mimeType: string; preview: string }>
  >([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const body = useMemo(
    () => ({
      provider: selectedModel.provider,
      model: selectedModel.model,
    }),
    [selectedModel.provider, selectedModel.model],
  )

  const { messages, sendMessage, isLoading, addToolApprovalResponse, stop } =
    useChat({
      connection: fetchServerSentEvents('/api/tanchat'),
      tools,
      body,
      onCustomEvent: (eventType, data, context) => {
        console.log(
          `[CustomEvent] ${eventType}`,
          data,
          context.toolCallId ? `(tool call: ${context.toolCallId})` : '',
        )
      },
    })
  const [input, setInput] = useState('')

  /**
   * Handle file selection for image attachment
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const newImages: Array<{
      id: string
      base64: string
      mimeType: string
      preview: string
    }> = []

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          // Remove data URL prefix (e.g., "data:image/png;base64,")
          resolve(result.split(',')[1])
        }
        reader.readAsDataURL(file)
      })

      const preview = URL.createObjectURL(file)
      newImages.push({
        id: generateMessageId(),
        base64,
        mimeType: file.type, // Capture the actual mime type
        preview,
      })
    }

    setAttachedImages((prev) => [...prev, ...newImages])

    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  /**
   * Remove an attached image
   */
  const removeImage = (id: string) => {
    setAttachedImages((prev) => {
      const image = prev.find((img) => img.id === id)
      if (image) {
        URL.revokeObjectURL(image.preview)
      }
      return prev.filter((img) => img.id !== id)
    })
  }

  /**
   * Send message with optional image attachments
   */
  const handleSendMessage = () => {
    if (!input.trim() && attachedImages.length === 0) return

    if (attachedImages.length > 0) {
      // Build multimodal content array
      const contentParts: Array<ContentPart> = []

      // Add text if present
      if (input.trim()) {
        contentParts.push({ type: 'text', content: input.trim() })
      }

      // Add images with mime type metadata
      for (const img of attachedImages) {
        contentParts.push({
          type: 'image',
          source: { type: 'data', value: img.base64, mimeType: img.mimeType },
        })
      }

      // Send with custom message ID
      sendMessage({
        content: contentParts,
        id: generateMessageId(),
      })

      // Clean up image previews
      attachedImages.forEach((img) => URL.revokeObjectURL(img.preview))
      setAttachedImages([])
    } else {
      // Simple text message
      sendMessage(input.trim())
    }

    setInput('')
  }

  return (
    <div className="flex h-[calc(100vh-72px)] bg-gray-900">
      {/* Chat */}
      <div className="w-full flex flex-col">
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
          </div>
        </div>

        <Messages
          messages={messages}
          addToolApprovalResponse={addToolApprovalResponse}
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

            {/* Image attachment preview */}
            {attachedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 p-2 bg-gray-800/50 rounded-lg border border-orange-500/20">
                {attachedImages.map((img) => (
                  <div key={img.id} className="relative group">
                    <img
                      src={img.preview}
                      alt="Attached"
                      className="w-16 h-16 object-cover rounded-lg border border-gray-700"
                    />
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative flex items-end gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Image attachment button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="p-3 text-gray-400 hover:text-orange-500 disabled:text-gray-600 transition-colors focus:outline-none"
                title="Attach image"
              >
                <ImagePlus className="w-5 h-5" />
              </button>

              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    attachedImages.length > 0
                      ? 'Add a message about your image(s)...'
                      : "Type something clever (or don't, we won't judge)..."
                  }
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
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey &&
                      (input.trim() || attachedImages.length > 0)
                    ) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={
                    (!input.trim() && attachedImages.length === 0) || isLoading
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-500 hover:text-orange-400 disabled:text-gray-500 transition-colors focus:outline-none"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </ChatInputArea>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ChatPage,
})
