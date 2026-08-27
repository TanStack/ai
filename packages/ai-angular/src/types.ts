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
import type { Signal } from '@angular/core'
import type { ReactiveOption } from './internal/to-reactive'

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
export type { ReactiveOption }

export type DeepPartial<T> =
  T extends ReadonlyArray<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

export type InjectChatOptions<
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
  | 'body'
  | 'forwardedProps'
> & {
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  /** Additional request body params. Reactive. */
  body?: ReactiveOption<Record<string, any>>
  /** Forwarded request props (preferred over `body`). Reactive. */
  forwardedProps?: ReactiveOption<Record<string, any>>
  /** Whether to keep a live subscription open. Reactive. */
  live?: ReactiveOption<boolean>
  outputSchema?: TSchema
} & ClientContextOptionFromTools<TTools, ReactiveOption<TContext>>

export type InjectChatResult<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> = BaseInjectChatResult<
  TTools,
  TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown,
  TInterrupts
> &
  (TSchema extends SchemaInput
    ? {
        /** Live progressively-parsed structured output. */
        partial: Signal<DeepPartial<InferSchemaType<TSchema>>>
        /** Final, schema-validated structured output. `null` until complete. */
        final: Signal<InferSchemaType<TSchema> | null>
      }
    : Record<never, never>)

interface BaseInjectChatResult<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TData = unknown,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> {
  /** Current messages in the conversation. */
  messages: Signal<Array<UIMessage<TTools, TData>>>
  sendMessage: (
    content: string | MultimodalContent,
    options?: SendMessageOptions,
  ) => Promise<void>
  /** Pending messages queued while a stream is in flight. */
  queue: Signal<ReadonlyArray<QueuedMessage>>
  /** Cancel a queued message before it drains. */
  cancelQueued: (id: string) => void
  /** Append a message to the conversation. */
  append: (message: ModelMessage | UIMessage<TTools, TData>) => Promise<void>
  /** Add the result of a client-side tool execution. */
  addToolResult: (result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => Promise<void>
  /** Respond to a tool approval request. */
  addToolApprovalResponse: (response: {
    id: string
    approved: boolean
  }) => Promise<void>
  runId: Signal<string | null>
  /** Immutable bound interrupts for the current interrupted run. */
  interrupts: Signal<BoundInterrupts<TTools, TInterrupts>>
  /** @deprecated Use `interrupts`. */
  pendingInterrupts: Signal<BoundInterrupts<TTools, TInterrupts>>
  /** Batch-level interrupt errors. */
  interruptErrors: Signal<
    ChatInterruptState<TTools, TInterrupts>['interruptErrors']
  >
  /** Whether the client is submitting an interrupt batch. */
  resuming: Signal<boolean>
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
  /** Reload the last assistant message. */
  reload: () => Promise<void>
  /** Stop the current response generation. */
  stop: () => void
  /** Whether a response is currently being generated. */
  isLoading: Signal<boolean>
  /** Current error, if any. */
  error: Signal<Error | undefined>
  /** Set messages manually. */
  setMessages: (messages: Array<UIMessage<TTools, TData>>) => void
  /** Clear all messages. */
  clear: () => void
  /** Current generation status. */
  status: Signal<ChatClientState>
  /** Whether the subscription loop is active. */
  isSubscribed: Signal<boolean>
  /** Current connection lifecycle status. */
  connectionStatus: Signal<ConnectionStatus>
  /** Whether the shared session is actively generating. */
  sessionGenerating: Signal<boolean>
}
