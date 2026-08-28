import { createContext, useContext } from 'react'
import type { ConnectionAdapter } from '@tanstack/ai-client'
import { useChat } from '../use-chat'
import type { ReactNode } from 'react'
import type { UIMessage, UseChatReturn } from '../types'

/**
 * Chat context - provides chat state to all child components
 */
const ChatContext = createContext<UseChatReturn | null>(null)

/**
 * Hook to access chat context
 * @throws Error if used outside of Chat component
 */
/** @deprecated Use `createChatUI().useChatContext()` instead. Deprecated in 0.9.0. Removed in 1.0.0. */
export function useChatContext() {
  const context = useContext(ChatContext)
  if (!context) {
    throw new Error(
      "Chat components must be wrapped in <Chat>. Make sure you're using Chat.Messages, Chat.Input, etc. inside a <Chat> component.",
    )
  }
  return context
}

/** @deprecated Use `createChatUI()` Chat/Provider instead. Deprecated in 0.9.0. Removed in 1.0.0. */
export interface ChatProps {
  /** Child components (Chat.Messages, Chat.Input, etc.) */
  children: ReactNode
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
  tools?: Record<string, React.ComponentType<{ input: any; output?: any }>>
}

/**
 * @deprecated Use `createChatUI()` from `@tanstack/ai-react-ui` instead.
 * See https://tanstack.com/ai/latest/docs/migration/create-ui
 * Deprecated in 0.9.0. Removed in 1.0.0.
 *
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
    ...(initialMessages !== undefined ? { initialMessages } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(onResponse !== undefined ? { onResponse } : {}),
    ...(onChunk !== undefined ? { onChunk } : {}),
    ...(onFinish !== undefined ? { onFinish } : {}),
    ...(onError !== undefined ? { onError } : {}),
  })

  return (
    <ChatContext.Provider value={chat}>
      <div className={className} data-chat-root>
        {children}
      </div>
    </ChatContext.Provider>
  )
}
