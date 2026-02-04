import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type {
  ChatClientOptions,
  ChatClientState,
  ChatRequestBody,
  UIMessage,
} from '@tanstack/ai-client'
import type { DeepReadonly, ShallowRef } from 'vue'

// Re-export types from ai-client
export type { ChatRequestBody, UIMessage }

/**
 * Options for the useChat composable.
 *
 * This extends ChatClientOptions but omits the state change callbacks that are
 * managed internally by Vue refs:
 * - `onMessagesChange` - Managed by Vue ref (exposed as `messages`)
 * - `onLoadingChange` - Managed by Vue ref (exposed as `isLoading`)
 * - `onErrorChange` - Managed by Vue ref (exposed as `error`)
 * - `onStatusChange` - Managed by Vue ref (exposed as `status`)
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
  messages: DeepReadonly<ShallowRef<Array<UIMessage<TTools>>>>

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
  isLoading: DeepReadonly<ShallowRef<boolean>>

  /**
   * Current error, if any
   */
  error: DeepReadonly<ShallowRef<Error | undefined>>

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
  status: DeepReadonly<ShallowRef<ChatClientState>>
}

// Note: createChatClientOptions and InferChatMessages are now in @tanstack/ai-client
// and re-exported from there for convenience
