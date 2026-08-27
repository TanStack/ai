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
import type { DeepReadonly, ShallowRef } from 'vue'

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

export type UseChatOptions<
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
  live?: boolean
  outputSchema?: TSchema
} & ClientContextOptionFromTools<TTools, TContext>

export type UseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> = BaseUseChatReturn<
  TTools,
  TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown,
  TInterrupts
> &
  (TSchema extends SchemaInput
    ? {
        partial: Readonly<ShallowRef<DeepPartial<InferSchemaType<TSchema>>>>
        final: Readonly<ShallowRef<InferSchemaType<TSchema> | null>>
      }
    : Record<never, never>)

interface BaseUseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TData = unknown,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> {
  messages: Readonly<ShallowRef<Array<UIMessage<TTools, TData>>>>

  sendMessage: (
    content: string | MultimodalContent,
    options?: SendMessageOptions,
  ) => Promise<void>

  queue: Readonly<ShallowRef<Array<QueuedMessage>>>

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

  runId: DeepReadonly<ShallowRef<string | null>>
  interrupts: Readonly<ShallowRef<BoundInterrupts<TTools, TInterrupts>>>
  /** @deprecated Use `interrupts`. */
  pendingInterrupts: Readonly<ShallowRef<BoundInterrupts<TTools, TInterrupts>>>
  interruptErrors: DeepReadonly<
    ShallowRef<ChatInterruptState<TTools, TInterrupts>['interruptErrors']>
  >
  resuming: DeepReadonly<ShallowRef<boolean>>
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

  isLoading: DeepReadonly<ShallowRef<boolean>>

  error: DeepReadonly<ShallowRef<Error | undefined>>

  setMessages: (messages: Array<UIMessage<TTools, TData>>) => void

  clear: () => void

  status: DeepReadonly<ShallowRef<ChatClientState>>

  isSubscribed: DeepReadonly<ShallowRef<boolean>>

  connectionStatus: DeepReadonly<ShallowRef<ConnectionStatus>>

  sessionGenerating: DeepReadonly<ShallowRef<boolean>>
}

// Note: createChatClientOptions and InferChatMessages are now in @tanstack/ai-client
// and re-exported from there for convenience
