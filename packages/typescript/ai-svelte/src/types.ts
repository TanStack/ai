import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type {
  ChatClientOptions,
  ChatClientState,
  ChatRequestBody,
  UIMessage,
} from '@tanstack/ai-client'

// Re-export types from ai-client
export type { ChatRequestBody, UIMessage }

/**
 * Options for the createChat function.
 *
 * This extends ChatClientOptions but omits the state change callbacks that are
 * managed internally by Svelte state:
 * - `onMessagesChange` - Managed by Svelte state (exposed as `messages`)
 * - `onLoadingChange` - Managed by Svelte state (exposed as `isLoading`)
 * - `onErrorChange` - Managed by Svelte state (exposed as `error`)
 * - `onStatusChange` - Managed by Svelte state (exposed as `status`)
 *
 * All other callbacks (onResponse, onChunk, onFinish, onError) are
 * passed through to the underlying ChatClient and can be used for side effects.
 *
 * Note: Connection and body changes will recreate the ChatClient instance.
 * To update these options, remount the component or use a key prop.
 */
export type CreateChatOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> = Omit<
  ChatClientOptions<TTools>,
  'onMessagesChange' | 'onLoadingChange' | 'onErrorChange' | 'onStatusChange'
>

export interface CreateChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> {
  /**
   * Current messages in the conversation (reactive getter)
   */
  readonly messages: Array<UIMessage<TTools>>

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
   * Whether a response is currently being generated (reactive getter)
   */
  readonly isLoading: boolean

  /**
   * Current error, if any (reactive getter)
   */
  readonly error: Error | undefined

  /**
   * Set messages manually
   */
  setMessages: (messages: Array<UIMessage<TTools>>) => void

  /**
   * Clear all messages
   */
  clear: () => void

  /**
   * Current generation status (reactive getter)
   */
  readonly status: ChatClientState
  /**
   * Update the body sent with requests (e.g., for changing model selection)
   */
  updateBody: (body: Record<string, any>) => void
}

// Note: createChatClientOptions and InferChatMessages are now in @tanstack/ai-client
// and re-exported from there for convenience
