import type { Signal } from '@angular/core'
import type { AnyClientTool, ModelMessage } from '@tanstack/ai'
import type {
  ChatClientOptions,
  ChatRequestBody,
  UIMessage,
} from '@tanstack/ai-client'

// Re-export types from ai-client
export type { UIMessage, ChatRequestBody }

/**
 * Options for the injectChat function.
 *
 * This extends ChatClientOptions but omits the state change callbacks that are
 * managed internally by Angular signals:
 * - `onMessagesChange` - Managed by signal (exposed as `messages`)
 * - `onLoadingChange` - Managed by signal (exposed as `isLoading`)
 * - `onErrorChange` - Managed by signal (exposed as `error`)
 */
export type InjectChatOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> = Omit<
  ChatClientOptions<TTools>,
  'onMessagesChange' | 'onLoadingChange' | 'onErrorChange'
>

export interface InjectChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> {
  /**
   * Current messages in the conversation
   */
  messages: Signal<Array<UIMessage<TTools>>>

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
  isLoading: Signal<boolean>

  /**
   * Current error, if any
   */
  error: Signal<Error | undefined>

  /**
   * Set messages manually
   */
  setMessages: (messages: Array<UIMessage<TTools>>) => void

  /**
   * Clear all messages
   */
  clear: () => void
}
