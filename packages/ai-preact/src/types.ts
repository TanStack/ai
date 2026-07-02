import type {
  AnyClientTool,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
} from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ChatClientOptions,
  ChatClientState,
  ChatPendingInterrupt,
  ChatRequestBody,
  ChatResumeState,
  ClientContextOptionFromTools,
  ConnectionStatus,
  DistributedOmit,
  InferredClientContext,
  MultimodalContent,
  UIMessage,
} from '@tanstack/ai-client'

// Re-export types from ai-client
export type { ChatRequestBody, MultimodalContent, UIMessage }

/**
 * Options for the useChat hook.
 *
 * This extends ChatClientOptions but omits the state change callbacks that are
 * managed internally by Preact state:
 * - `onMessagesChange` - Managed by Preact state (exposed as `messages`)
 * - `onLoadingChange` - Managed by Preact state (exposed as `isLoading`)
 * - `onErrorChange` - Managed by Preact state (exposed as `error`)
 * - `onStatusChange` - Managed by Preact state (exposed as `status`)
 *
 * All other callbacks (onResponse, onChunk, onFinish, onError) are
 * passed through to the underlying ChatClient and can be used for side effects.
 *
 * Note: Connection and body changes will recreate the ChatClient instance.
 * To update these options, remount the component or use a key prop.
 */
export type UseChatOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = InferredClientContext<TTools>,
> = DistributedOmit<
  ChatClientOptions<TTools, TContext>,
  | 'onMessagesChange'
  | 'onLoadingChange'
  | 'onErrorChange'
  | 'onStatusChange'
  | 'onSubscriptionChange'
  | 'onConnectionStatusChange'
  | 'onSessionGeneratingChange'
  | 'onResumeStateChange'
  | 'context'
  | 'devtools'
> & {
  live?: boolean
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /**
   * Standard-schema-compatible schema used to identify structured-output chat
   * hooks in devtools. Preact currently exposes structured-output parts via
   * `messages`; typed `partial` / `final` sugar is implemented in the other
   * framework adapters.
   */
  outputSchema?: SchemaInput
} & ClientContextOptionFromTools<TTools, TContext>

export interface UseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> {
  /**
   * Current messages in the conversation
   */
  messages: Array<UIMessage<TTools>>

  /**
   * Send a message and get a response.
   * Can be a simple string or multimodal content with images, audio, etc.
   */
  sendMessage: (content: string | MultimodalContent) => Promise<void>

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
    output: unknown
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

  resumeState: ChatResumeState | null
  pendingInterrupts: Array<ChatPendingInterrupt>
  resume: (state?: ChatResumeState) => Promise<boolean>
  resumeInterrupts: (
    resume: Array<RunAgentResumeItem>,
    state?: ChatResumeState,
  ) => Promise<boolean>

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
  isLoading: boolean

  /**
   * Current error, if any
   */
  error: Error | undefined

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
  status: ChatClientState

  /**
   * Whether the subscription loop is currently active
   */
  isSubscribed: boolean

  /**
   * Current connection lifecycle status
   */
  connectionStatus: ConnectionStatus

  /**
   * Whether the shared session is actively generating.
   * Derived from stream run events (RUN_STARTED / RUN_FINISHED / RUN_ERROR).
   * Unlike `isLoading` (request-local), this reflects shared generation
   * activity visible to all subscribers (e.g. across tabs/devices).
   */
  sessionGenerating: boolean
}
