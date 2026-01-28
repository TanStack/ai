import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import { useChat } from '@tanstack/ai-preact'
import type { ComponentChildren } from 'preact'
import type {
  ConnectionAdapter,
  UIMessage,
  UseChatReturn,
} from '@tanstack/ai-preact'

/**
 * Chat context - provides chat state to all child components
 */
const ChatContext = createContext<UseChatReturn | null>(null)

/**
 * Hook to access chat context
 * @throws Error if used outside of Chat component
 */
export function useChatContext() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error(
      "Chat components must be wrapped in <Chat>. Make sure you're using Chat.Messages, Chat.Input, etc. inside a <Chat> component.",
    )
  }
  return context
}

export interface ChatProps {
  /** Child components (Chat.Messages, Chat.Input, etc.) */
  children: ComponentChildren
  /** CSS class name for the root element */
  className?: string
  /** Connection adapter for communicating with your API */
  connection: ConnectionAdapter
  /** Initial messages to display */
  initialMessages?: Array<UIMessage>
  /** Custom message ID generator */
  id?: string
  /** Additional body data to send with requests */
  body?: any
  /** Callback when a response is received */
  onResponse?: (response?: Response) => void | Promise<void>
  /** Callback when each chunk arrives */
  onChunk?: (chunk: any) => void
  /** Callback when a message is complete */
  onFinish?: (message: UIMessage) => void
  /** Callback when an error occurs */
  onError?: (error: Error) => void
  /** Custom tool components registry */
  tools?: Record<string, any>
}

/**
 * Root Chat component - provides context for all chat subcomponents
 *
 * @example
 * ```tsx
 * <Chat connection={fetchServerSentEvents("/api/chat")}>
 *   <Chat.Messages />
 *   <Chat.Input />
 * </Chat>
 * ```
 */
export function Chat({
  children,
  className,
  connection,
  initialMessages,
  id,
  body,
  onResponse,
  onChunk,
  onFinish,
  onError,
}: ChatProps) {
  const chat = useChat({
    connection,
    initialMessages,
    id,
    body,
    onResponse,
    onChunk,
    onFinish,
    onError,
  })

  return (
    <ChatContext.Provider value={chat}>
      <div className={className} data-chat-root>
        {children}
      </div>
    </ChatContext.Provider>
  )
}
