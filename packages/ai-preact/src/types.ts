import type {
  AnyClientTool,
  InterruptDefinition,
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

export type UseChatOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
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
  outputSchema?: SchemaInput
} & ClientContextOptionFromTools<TTools, TContext>

export interface UseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> {
  messages: Array<UIMessage<TTools>>

  sendMessage: (
    content: string | MultimodalContent,
    options?: SendMessageOptions,
  ) => Promise<void>

  queue: Array<QueuedMessage>

  cancelQueued: (id: string) => void

  append: (message: ModelMessage | UIMessage<TTools>) => Promise<void>

  addToolResult: (result: {
    toolCallId: string
    tool: string
    output: unknown
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => Promise<void>

  addToolApprovalResponse: (response: {
    id: string // approval.id, not toolCallId
    approved: boolean
  }) => Promise<void>

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

  reload: () => Promise<void>

  stop: () => void

  isLoading: boolean

  error: Error | undefined

  setMessages: (messages: Array<UIMessage<TTools>>) => void

  clear: () => void

  status: ChatClientState

  isSubscribed: boolean

  connectionStatus: ConnectionStatus

  sessionGenerating: boolean
}
