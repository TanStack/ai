import { useEffect, useRef, useState } from 'react'
import type { UIMessage } from '@tanstack/ai-react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { ToolCallDisplay } from '@/components/ToolCallDisplay'
import { ApprovalPrompt } from '@/components/ApprovalPrompt'

interface ChatUIProps {
  messages: Array<UIMessage>
  isLoading: boolean
  onSendMessage: (text: string) => void
  onSendMessageWithImage?: (text: string, file: File) => void
  addToolApprovalResponse?: (response: {
    id: string
    approved: boolean
  }) => Promise<void>
  showImageInput?: boolean
  onStop?: () => void
  /** When the streaming structured-output CUSTOM event lands, the page
   *  exposes the parsed object here so e2e tests can assert that the event
   *  reached the client (not just that the JSON text was rendered). */
  structuredObject?: unknown
  /** Number of TEXT_MESSAGE_CONTENT chunks observed. Used by streaming e2e
   *  tests to verify the response actually streamed in multiple deltas. */
  contentDeltaCount?: number
}

export function ChatUI({
  messages,
  isLoading,
  onSendMessage,
  onSendMessageWithImage,
  addToolApprovalResponse,
  showImageInput,
  onStop,
  structuredObject,
  contentDeltaCount,
}: ChatUIProps) {
  const [input, setInput] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = () => {
    if (!input.trim()) return
    onSendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-60px)]">
      {structuredObject != null && (
        <div
          data-testid="structured-output-complete"
          data-structured-output={JSON.stringify(structuredObject)}
          hidden
        />
      )}
      {contentDeltaCount != null && (
        <div
          data-testid="content-delta-count"
          data-count={String(contentDeltaCount)}
          hidden
        />
      )}
      <div
        ref={messagesRef}
        data-testid="message-list"
        className="flex-1 overflow-y-auto p-4 space-y-4"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            data-testid={
              message.role === 'user' ? 'user-message' : 'assistant-message'
            }
            className={`p-3 rounded-lg ${
              message.role === 'user'
                ? 'bg-orange-500/10 border border-orange-500/20 ml-12'
                : 'bg-gray-800/50 border border-gray-700 mr-12'
            }`}
          >
            {message.parts.map((part, i) => {
              if (part.type === 'text') {
                return (
                  <div
                    key={i}
                    data-testid="text-part"
                    className="prose prose-invert prose-sm max-w-none"
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw, rehypeSanitize]}
                    >
                      {part.content}
                    </ReactMarkdown>
                  </div>
                )
              }
              if (part.type === 'image') {
                const imgPart = part as any
                const src =
                  imgPart.source?.type === 'data'
                    ? `data:${imgPart.source.mimeType};base64,${imgPart.source.value}`
                    : imgPart.source?.type === 'url'
                      ? imgPart.source.value
                      : undefined
                return src ? (
                  <img
                    key={i}
                    src={src}
                    alt="uploaded"
                    data-testid="image-part"
                    className="max-w-xs max-h-48 rounded mt-1"
                  />
                ) : null
              }
              if (part.type === 'thinking') {
                return (
                  <div
                    key={i}
                    data-testid="thinking-block"
                    className="text-xs text-gray-500 italic border-l-2 border-gray-600 pl-2 my-2"
                  >
                    {part.content}
                  </div>
                )
              }
              if (
                part.type === 'tool-call' &&
                (part as any).state === 'approval-requested' &&
                addToolApprovalResponse
              ) {
                return (
                  <ApprovalPrompt
                    key={i}
                    part={part as any}
                    onRespond={addToolApprovalResponse}
                  />
                )
              }
              if (part.type === 'tool-call') {
                return <ToolCallDisplay key={i} part={part as any} />
              }
              if (part.type === 'tool-result') {
                return (
                  <div
                    key={i}
                    data-testid={`tool-call-result-${(part as any).toolCallId}`}
                    className="text-gray-300 text-xs mt-1"
                  >
                    Result: <code>{(part as any).content}</code>
                  </div>
                )
              }
              if (part.type === 'structured-output') {
                // Render the streamed JSON so the assistant message has
                // visible content for selectors (e.g. `getLastAssistantMessage`).
                // Previously this content arrived as a `text` part — the new
                // routing puts it on a `structured-output` part instead.
                const sop = part as any
                const text =
                  sop.raw ||
                  (sop.data !== undefined ? JSON.stringify(sop.data) : '')
                if (text === '') return null
                return (
                  <div
                    key={i}
                    data-testid="structured-output-part"
                    className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap break-words"
                  >
                    {text}
                  </div>
                )
              }
              return null
            })}
          </div>
        ))}
      </div>

      {isLoading && (
        <div
          data-testid="loading-indicator"
          className="px-4 py-1 text-xs text-gray-400"
        >
          Generating...
        </div>
      )}

      <div className="border-t border-gray-700 p-3 flex gap-2">
        {showImageInput && (
          <input
            type="file"
            accept="image/*"
            data-testid="image-attachment-input"
            className="text-xs text-gray-400"
            onChange={(e) => {
              const file = e.target.files?.[0]
              // Read the prompt from the live input DOM value rather than the
              // `input` React state. Attaching a file auto-sends, and under
              // load a controlled input's state can lag the committed DOM
              // value — reading state here would send an empty/partial prompt.
              const text = (inputRef.current?.value ?? input).trim()
              if (file && text && onSendMessageWithImage) {
                onSendMessageWithImage(text, file)
                setInput('')
              }
            }}
          />
        )}
        <input
          ref={inputRef}
          data-testid="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Type a message..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-orange-500/50"
        />
        <button
          data-testid="send-button"
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="px-4 py-2 bg-orange-500 text-white rounded text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
        {isLoading && onStop && (
          <button
            data-testid="stop-button"
            onClick={onStop}
            className="px-4 py-2 bg-red-500 text-white rounded text-sm font-medium"
          >
            Stop
          </button>
        )}
      </div>
    </div>
  )
}
