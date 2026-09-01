import type {
  AnyClientTool,
  InterruptDefinition,
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
  ResolvableChatInterrupt,
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
 * Recursive partial. Every property and every nested array element is optional.
 * Used to type the in-flight `partial` value the helper exposes while a
 * structured output stream is still arriving (the JSON has shape but is
 * incomplete).
 */
export type DeepPartial<T> =
  T extends ReadonlyArray<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

/**
 * Options for the createChat helper.
 *
 * Call `createChat(handle, options)` in Remix setup with Handle from
 * `remix/ui`. Handle is the first argument of the helper. It is not part of
 * this type. The default id is `options.threadId ?? handle.id`.
 *
 * Pass either `connection` or `fetcher`. The XOR is enforced at the type
 * level via `ChatTransport`.
 *
 * This extends ChatClientOptions but omits the state change callbacks that
 * createChat manages internally:
 * - `onMessagesChange` - Managed internally (exposed as `messages`)
 * - `onLoadingChange` - Managed internally (exposed as `isLoading`)
 * - `onErrorChange` - Managed internally (exposed as `error`)
 * - `onStatusChange` - Managed internally (exposed as `status`)
 *
 * All other callbacks (onResponse, onChunk, onFinish, onError) are
 * passed through to the underlying ChatClient and can be used for side effects.
 *
 * When `outputSchema` is supplied, the helper returns a typed `partial` (live
 * progressive object, updated from `TEXT_MESSAGE_CONTENT` deltas via
 * `parsePartialJSON`) and `final` (validated terminal payload from the
 * `structured-output.complete` event). The schema is used purely for type
 * inference on the client. Server-side validation still runs against the
 * schema you pass to `chat({ outputSchema })` on the server route.
 *
 * Changing `connection` or `fetcher` updates the active ChatClient in place,
 * preserving its state. Changing `threadId` creates a fresh client.
 */
export type CreateChatOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> = DistributedOmit<
  ChatClientOptions<TTools, TContext, TInterrupts>,
  | 'onMessagesChange'
  | 'onLoadingChange'
  | 'onErrorChange'
  | 'onStatusChange'
  | 'onSubscriptionChange'
  | 'onConnectionStatusChange'
  | 'onSessionGeneratingChange'
  | 'onQueueChange'
  | 'onResumeStateChange'
  | 'onRunIdChange'
  | 'context'
  | 'devtools'
> & {
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /**
   * Opt into live subscription behavior when the helper is called in Remix
   * setup with Handle. When enabled, the helper subscribes on setup and
   * unsubscribes on dispose.
   */
  live?: boolean
  /**
   * Standard-schema-compatible schema (Zod, Valibot, ArkType, or a plain JSON
   * Schema). Used to infer the shape of `partial` and `final` in the return.
   * The schema is **not** sent to the server. Server-side validation runs
   * against the schema passed to `chat({ outputSchema })` on the server route.
   */
  outputSchema?: TSchema
} & ClientContextOptionFromTools<TTools, TContext>

/**
 * Discriminated return shape from the createChat helper. When `outputSchema`
 * is supplied, the helper adds typed `partial` / `final` fields. When it is
 * omitted (default), the return is unchanged. Fields are plain values.
 */
export type CreateChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> = BaseCreateChatReturn<
  TTools,
  TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown,
  TInterrupts
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

interface BaseCreateChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TData = unknown,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> {
  /**
   * Current messages in the conversation. When `outputSchema` is supplied,
   * `messages[i].parts.find(p => p.type === 'structured-output')` is typed
   * with the schema's inferred shape: `data: T`, `partial: DeepPartial<T>`.
   */
  messages: Array<UIMessage<TTools, TData>>

  /**
   * Send a message and get a response.
   * Can be a simple string or multimodal content with images, audio, etc.
   * By default, sends while busy are queued until the run settles successfully
   * (`queue: 'drop'` restores the old drop-while-busy behavior).
   * Pass `{ whenBusy }` to override the policy for a single send, or
   * `{ body }` to merge per-call JSON into this request's `forwardedProps`.
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

  /**
   * The id of the run this client has in flight (one it started or rejoined),
   * or `null` when there is none (including while a run sits paused on an
   * interrupt, waiting on approval).
   *
   * A run is one turn of the conversation, so this changes from turn to turn. A
   * whole tool loop stays inside one run, while resuming after an interrupt
   * continues the turn under a new id — so one user message can produce several
   * run ids. Use it to talk to your own server about that run (cancel it, poll
   * it, correlate a log line).
   */
  runId: string | null
  interrupts: BoundInterrupts<TTools, TInterrupts>
  /** @deprecated Use `interrupts`. */
  pendingInterrupts: BoundInterrupts<TTools, TInterrupts>
  interruptErrors: ChatInterruptState<TTools, TInterrupts>['interruptErrors']
  resuming: boolean
  resolveInterrupts: {
    (approved: boolean): void
    (
      resolver: (
        interrupt: ResolvableChatInterrupt<TTools, TInterrupts>,
      ) => undefined,
    ): void
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

// createChatClientOptions and InferChatMessages live in @tanstack/ai-client
// and are re-exported from there.
