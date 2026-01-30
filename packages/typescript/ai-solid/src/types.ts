import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type {
  ChatClientOptions,
  ChatClientState,
  ChatRequestBody,
  UIMessage,
} from '@tanstack/ai-client'
import type { Accessor } from 'solid-js'

// Re-export types from ai-client
export type { ChatRequestBody, UIMessage }

/**
 * Options for the useChat hook.
 *
 * This extends ChatClientOptions but omits the state change callbacks that are
 * managed internally by Solid signals:
 * - `onMessagesChange` - Managed by Solid signal (exposed as `messages`)
 * - `onLoadingChange` - Managed by Solid signal (exposed as `isLoading`)
 * - `onErrorChange` - Managed by Solid signal (exposed as `error`)
 * - `onStatusChange` - Managed by Solid signal (exposed as `status`)
 *
 * All other callbacks (onResponse, onChunk, onFinish, onError) are
 * passed through to the underlying ChatClient and can be used for side effects.
 *
 * Note: Connection and body changes will recreate the ChatClient instance.
 * To update these options, remount the component or use a key prop.
 */
export type UseChatOptions<TTools extends ReadonlyArray<AnyClientTool> = any> =
  Omit<
    ChatClientOptions<TTools>,
    'onMessagesChange' | 'onLoadingChange' | 'onErrorChange' | 'onStatusChange'
  >

export interface UseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> {
  /**
   * Current messages in the conversation
   */
  messages: Accessor<Array<UIMessage<TTools>>>

  /**
   * Send a message and get a response
   */
  sendMessage: (content: string) => Promise<void>

  /**
   * Append a message to the conversation
   */
  append: (message: ModelMessage | UIMessage<TTools>) => Promise<void>

  /**
   * Add the result of a client-side tool execution
   */
  addToolResult: (result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => Promise<void>

  /**
   * Respond to a tool approval request
   */
  addToolApprovalResponse: (response: {
    id: string // approval.id, not toolCallId
    approved: boolean
  }) => Promise<void>

  /**
   * Reload the last assistant message
   */
  reload: () => Promise<void>

  /**
   * Stop the current response generation
   */
  stop: () => void

  /**
   * Whether a response is currently being generated
   */
  isLoading: Accessor<boolean>

  /**
   * Current error, if any
   */
  error: Accessor<Error | undefined>

  /**
   * Set messages manually
   */
  setMessages: (messages: Array<UIMessage<TTools>>) => void

  /**
   * Clear all messages
   */
  clear: () => void

  /**
   * Current generation status
   */
  status: Accessor<ChatClientState>
}

// Note: createChatClientOptions and InferChatMessages are now in @tanstack/ai-client
// and re-exported from there for convenience
