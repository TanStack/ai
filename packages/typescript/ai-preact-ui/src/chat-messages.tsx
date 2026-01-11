import { useEffect, useRef } from 'preact/hooks'
import { useChatContext } from './chat'
import { ChatMessage } from './chat-message'
import type { ComponentChildren } from 'preact'
import type { UIMessage } from '@tanstack/ai-preact'

export interface ChatMessagesProps {
  /** Custom render function for each message */
  children?: (message: UIMessage, index: number) => ComponentChildren
  /** CSS class name */
  className?: string
  /** Element to show when there are no messages */
  emptyState?: ComponentChildren
  /** Element to show while loading the first message */
  loadingState?: ComponentChildren
  /** Custom error renderer */
  errorState?: (props: {
    error: Error
    reload: () => void
  }) => ComponentChildren
  /** Auto-scroll to bottom on new messages */
  autoScroll?: boolean
}

/**
 * Messages container - renders all messages in the conversation
 *
 * @example
 * ```tsx
 * <Chat.Messages>
 *   {(message) => <Chat.Message message={message} />}
 * </Chat.Messages>
 * ```
 */
export function ChatMessages({
  children,
  className,
  emptyState,
  loadingState,
  errorState,
  autoScroll = true,
}: ChatMessagesProps) {
  const { messages, isLoading, error, reload } = useChatContext()
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages, autoScroll])

  // Error state
  if (error && errorState) {
    return <>{errorState({ error, reload })}</>
  }

  // Loading state (only show if no messages yet)
  if (isLoading && messages.length === 0 && loadingState) {
    return <>{loadingState}</>
  }

  // Empty state
  if (messages.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <div
      ref={containerRef}
      className={className}
      data-chat-messages
      data-message-count={messages.length}
    >
      {messages.map((message, index) =>
        children ? (
          <div key={message.id} data-message-id={message.id}>
            {children(message, index)}
          </div>
        ) : (
          <ChatMessage key={message.id} message={message} />
        ),
      )}
    </div>
  )
}
