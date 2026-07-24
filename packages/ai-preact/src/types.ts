import type {
  AnyClientTool,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
} from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  BoundInterrupts,
  ChatClientOptions,
  ChatClientState,
  ChatInterrupt,
  ChatInterruptState,
  ChatRequestBody,
  ChatResumeState,
  ClientContextOptionFromTools,
  ConnectionStatus,
  DistributedOmit,
  InferredClientContext,
  MultimodalContent,
  QueueConfig,
  QueueOption,
  QueueStrategy,
  QueuedMessage,
  SendMessageOptions,
  UIMessage,
  WhenBusy,
} from '@tanstack/ai-client'

// Re-export types from ai-client
export type {
  ChatRequestBody,
  MultimodalContent,
  QueueConfig,
  QueuedMessage,
  QueueOption,
  QueueStrategy,
  SendMessageOptions,
  UIMessage,
  WhenBusy,
}

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
  | 'onQueueChange'
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
  sendMessage: (
    content: string | MultimodalContent,
    options?: SendMessageOptions,
  ) => Promise<void>

  /**
   * Pending messages queued while a stream is in flight.
   */
  queue: Array<QueuedMessage>

  /**
   * Cancel a queued message before it drains. No-op if already sent.
   */
  cancelQueued: (id: string) => void

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
  interrupts: BoundInterrupts<TTools>
  /** @deprecated Use `interrupts`. */
  pendingInterrupts: BoundInterrupts<TTools>
  interruptErrors: ChatInterruptState<TTools>['interruptErrors']
  resuming: boolean
  resolveInterrupts: {
    (approved: boolean): void
    (resolver: (interrupt: ChatInterrupt<TTools>) => undefined): void
  }
  cancelInterrupts: () => void
  retryInterrupts: () => void
  resumeInterruptsUnsafe: (
    resume: Array<RunAgentResumeItem>,
    state?: ChatResumeState,
  ) => Promise<boolean>
  /** @deprecated Use bound interrupt methods or `resumeInterruptsUnsafe`. */
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
