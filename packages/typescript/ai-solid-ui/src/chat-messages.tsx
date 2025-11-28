import { For, createEffect } from 'solid-js'
import { useChatContext } from './chat'
import { ChatMessage } from './chat-message'
import type { JSX } from 'solid-js'
import type { UIMessage } from '@tanstack/ai-solid'

export interface ChatMessagesProps {
  /** Custom render function for each message */
  children?: (message: UIMessage, index: number) => JSX.Element
  /** CSS class name */
  class?: string
  /** Element to show when there are no messages */
  emptyState?: JSX.Element
  /** Element to show while loading the first message */
  loadingState?: JSX.Element
  /** Custom error renderer */
  errorState?: (props: { error: Error; reload: () => void }) => JSX.Element
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
export function ChatMessages(props: ChatMessagesProps) {
  const { messages, isLoading, error, reload } = useChatContext()
  let containerRef: HTMLDivElement | undefined

  // Auto-scroll to bottom on new messages
  createEffect(() => {
    // Track messages to trigger effect on change
    messages()
    if ((props.autoScroll ?? true) && containerRef) {
      containerRef.scrollTop = containerRef.scrollHeight
    }
  })

  // Error state
  if (error() && props.errorState) {
    return <>{props.errorState({ error: error()!, reload })}</>
  }

  // Loading state (only show if no messages yet)
  if (isLoading() && messages().length === 0 && props.loadingState) {
    return <>{props.loadingState}</>
  }

  // Empty state
  if (messages().length === 0 && props.emptyState) {
    return <>{props.emptyState}</>
  }

  return (
    <div
      ref={(el) => {
        containerRef = el
      }}
      class={props.class}
      data-chat-messages
      data-message-count={messages().length}
    >
      <For each={messages()}>
        {(message, index) =>
          props.children ? (
            <div data-message-id={message.id}>
              {props.children(message, index())}
            </div>
          ) : (
            <ChatMessage message={message} />
          )
        }
      </For>
    </div>
  )
}
