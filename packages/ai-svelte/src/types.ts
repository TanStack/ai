import type {
  AnyClientTool,
  InterruptDefinition,
  InferSchemaType,
  ModelMessage,
  RunAgentResumeItem,
  SchemaInput,
} from '@tanstack/ai'
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

export type DeepPartial<T> =
  T extends ReadonlyArray<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

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
  live?: boolean
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  outputSchema?: TSchema
} & ClientContextOptionFromTools<TTools, TContext>

export type CreateChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = unknown,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> = BaseCreateChatReturn<
  TTools,
  TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown,
  TContext,
  TInterrupts
> &
  (TSchema extends SchemaInput
    ? {
        readonly partial: DeepPartial<InferSchemaType<TSchema>>
        readonly final: InferSchemaType<TSchema> | null
      }
    : Record<never, never>)

interface BaseCreateChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TData = unknown,
  TContext = unknown,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> {
  readonly messages: Array<UIMessage<TTools, TData>>

  sendMessage: (
    content: string | MultimodalContent,
    options?: SendMessageOptions,
  ) => Promise<void>

  readonly queue: Array<QueuedMessage>

  cancelQueued: (id: string) => void

  append: (message: ModelMessage | UIMessage<TTools, TData>) => Promise<void>

  addToolResult: (result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => Promise<void>

  addToolApprovalResponse: (response: {
    id: string // approval.id, not toolCallId
    approved: boolean
  }) => Promise<void>

  readonly runId: string | null
  readonly interrupts: BoundInterrupts<TTools, TInterrupts>
  /** @deprecated Use `interrupts`. */
  readonly pendingInterrupts: BoundInterrupts<TTools, TInterrupts>
  readonly interruptErrors: ChatInterruptState<
    TTools,
    TInterrupts
  >['interruptErrors']
  readonly resuming: boolean
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

  reload: () => Promise<void>

  stop: () => void

  dispose: () => void

  readonly isLoading: boolean

  readonly error: Error | undefined

  setMessages: (messages: Array<UIMessage<TTools, TData>>) => void

  clear: () => void

  readonly status: ChatClientState
  readonly isSubscribed: boolean
  readonly connectionStatus: ConnectionStatus
  readonly sessionGenerating: boolean
  updateBody: (body: Record<string, any>) => void
  updateForwardedProps: (forwardedProps: Record<string, any>) => void
  updateContext: (context: TContext) => void
}

// Note: createChatClientOptions and InferChatMessages are now in @tanstack/ai-client
// and re-exported from there for convenience
