import { ref } from 'remix/ui'
import type { Handle, RemixNode } from 'remix/ui'
import { useChatContext } from './chat.tsx'
import { ChatMessage } from './chat-message.tsx'
import type { UIMessage } from '../types.ts'

/** @deprecated Use `createChatUI()` Messages instead. Removed in 1.0.0. */
export interface ChatMessagesProps {
  children?: (message: UIMessage, index: number) => RemixNode
  class?: string
  emptyState?: RemixNode
  loadingState?: RemixNode
  errorState?: (props: {
    error: Error
    reload: () => Promise<void>
  }) => RemixNode
  autoScroll?: boolean
}

/** @deprecated Use `createChatUI()` Messages instead. Removed in 1.0.0. */
export function ChatMessages(handle: Handle<ChatMessagesProps>) {
  let container: HTMLElement | null = null

  return () => {
    const { messages, isLoading, error, reload } = useChatContext(handle)
    const autoScroll = handle.props.autoScroll !== false

    if (autoScroll && container) {
      container.scrollTop = container.scrollHeight
    }

    if (error && handle.props.errorState) {
      return handle.props.errorState({ error, reload })
    }

    if (isLoading && messages.length === 0 && handle.props.loadingState) {
      return handle.props.loadingState
    }

    if (messages.length === 0 && handle.props.emptyState) {
      return handle.props.emptyState
    }

    return (
      <div
        class={handle.props.class}
        data-chat-messages
        data-message-count={messages.length}
        mix={[
          ref((node) => {
            container = node
          }),
        ]}
      >
        {messages.map((message, index) =>
          typeof handle.props.children === 'function' ? (
            <div key={message.id} data-message-id={message.id}>
              {handle.props.children(message, index)}
            </div>
          ) : (
            <ChatMessage key={message.id} message={message} />
          ),
        )}
      </div>
    )
  }
}
