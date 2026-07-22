import type {
  AnyClientTool,
  InferSchemaType,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
} from '@tanstack/ai/client'
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
 * Recursive partial — every property and every nested array element is optional.
 * Used to type the in-flight `partial` value the hook exposes while a structured
 * output stream is still arriving (the JSON has shape but is incomplete).
 */
export type DeepPartial<T> =
  T extends ReadonlyArray<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

/**
 * Options for the useChat hook.
 *
 * Pass either `connection` or `fetcher` — the XOR is enforced at the type
 * level via `ChatTransport`.
 *
 * This extends ChatClientOptions but omits the state change callbacks that are
 * managed internally by React state:
 * - `onMessagesChange` - Managed by React state (exposed as `messages`)
 * - `onLoadingChange` - Managed by React state (exposed as `isLoading`)
 * - `onErrorChange` - Managed by React state (exposed as `error`)
 * - `onStatusChange` - Managed by React state (exposed as `status`)
 *
 * All other callbacks (onResponse, onChunk, onFinish, onError) are
 * passed through to the underlying ChatClient and can be used for side effects.
 *
 * When `outputSchema` is supplied, the hook returns a typed `partial` (live
 * progressive object, updated from `TEXT_MESSAGE_CONTENT` deltas via
 * `parsePartialJSON`) and `final` (validated terminal payload from the
 * `structured-output.complete` event). The schema is used purely for type
 * inference on the client — server-side validation still runs against the
 * schema you pass to `chat({ outputSchema })` on the server route.
 *
 * Note: Connection and body changes will recreate the ChatClient instance.
 * To update these options, remount the component or use a key prop.
 */
export type UseChatOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
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
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /**
   * Opt into mount-time live subscription behavior.
   * When enabled, the hook subscribes on mount and unsubscribes on unmount.
   */
  live?: boolean
  /**
   * Standard-schema-compatible schema (Zod, Valibot, ArkType, or a plain JSON
   * Schema). Used to infer the shape of `partial` and `final` in the return.
   * The schema is **not** sent to the server — server-side validation runs
   * against the schema passed to `chat({ outputSchema })` on the server route.
   */
  outputSchema?: TSchema
} & ClientContextOptionFromTools<TTools, TContext>

/**
 * Discriminated return shape: when `outputSchema` is supplied, the hook adds
 * typed `partial` / `final` fields; when it is omitted (default), the return
 * is unchanged.
 */
export type UseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
> = BaseUseChatReturn<
  TTools,
  TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown
> &
  (TSchema extends SchemaInput
    ? {
        /**
         * Live, progressively-parsed structured output. Updated from
         * `TEXT_MESSAGE_CONTENT` deltas via `parsePartialJSON` while the stream
         * is still arriving, and snapped to the validated payload when
         * `structured-output.complete` fires. Resets on every new run
         * (`sendMessage` / `reload`).
         */
        partial: DeepPartial<InferSchemaType<TSchema>>
        /**
         * Final, schema-validated structured output. `null` until the terminal
         * `structured-output.complete` event arrives. Resets on every new run.
         */
        final: InferSchemaType<TSchema> | null
      }
    : Record<never, never>)

interface BaseUseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TData = unknown,
> {
  /**
   * Current messages in the conversation. When `outputSchema` is supplied,
   * `messages[i].parts.find(p => p.type === 'structured-output')` is typed
   * with the schema's inferred shape — `data: T`, `partial: DeepPartial<T>`.
   */
  messages: Array<UIMessage<TTools, TData>>

  /**
   * Send a message and get a response.
   * Can be a simple string or multimodal content with images, audio, etc.
   * By default, sends while busy are queued until the run settles successfully
   * (`queue: 'drop'` restores the old drop-while-busy behavior).
   * Pass `{ whenBusy }` to override the policy for a single send.
   */
  sendMessage: (
    content: string | MultimodalContent,
    options?: SendMessageOptions,
  ) => Promise<void>

  /**
   * Pending messages queued while the client is busy (streaming, claiming a
   * send, or draining). Separate from `messages` until they drain.
   */
  queue: Array<QueuedMessage>

  /**
   * Cancel a queued message before it drains. No-op if already sent.
   */
  cancelQueued: (id: string) => void

  /**
   * Append a message to the conversation
   */
  append: (message: ModelMessage | UIMessage<TTools, TData>) => Promise<void>

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
   * Current status of the chat client
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

  /**
   * Set messages manually
   */
  setMessages: (messages: Array<UIMessage<TTools, TData>>) => void

  /**
   * Clear all messages
   */
  clear: () => void
}

// Note: createChatClientOptions and InferChatMessages are now in @tanstack/ai-client
// and re-exported from there for convenience
