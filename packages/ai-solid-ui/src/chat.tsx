import { createContext, useContext } from 'solid-js'
import { useChat } from '@tanstack/ai-solid'
import type { JSX } from 'solid-js'
import type {
  ConnectionAdapter,
  UIMessage,
  UseChatReturn,
} from '@tanstack/ai-solid'

/**
 * Chat context - provides chat state to all child components
 */
const ChatContext = createContext<UseChatReturn | null>(null)

/**
 * Hook to access chat context
 * @throws Error if used outside of Chat component
 */
export function useChatContext(): UseChatReturn {
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
  children: JSX.Element
  /** CSS class name for the root element */
  class?: string
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
  /** Client-side tools with execute functions */
  tools?: Array<any>
  /** Custom tool components registry for rendering */
  toolComponents?: Record<
    string,
    (props: { input: any; output?: any }) => JSX.Element
  >
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
export function Chat(props: ChatProps) {
  const chat = useChat({
    connection: props.connection,
    ...(props.initialMessages !== undefined && {
      initialMessages: props.initialMessages,
    }),
    ...(props.id !== undefined && { id: props.id }),
    ...(props.body !== undefined && { body: props.body }),
    ...(props.onResponse !== undefined && { onResponse: props.onResponse }),
    ...(props.onChunk !== undefined && { onChunk: props.onChunk }),
    ...(props.onFinish !== undefined && { onFinish: props.onFinish }),
    ...(props.onError !== undefined && { onError: props.onError }),
    ...(props.tools !== undefined && { tools: props.tools }),
  })

  return (
    <ChatContext.Provider value={chat}>
      <div class={props.class} data-chat-root>
        {props.children}
      </div>
    </ChatContext.Provider>
  )
}
