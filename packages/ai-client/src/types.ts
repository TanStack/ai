import type {
  AnyClientTool,
  ApprovalCapabilityOf,
  ApprovalSchemaOf,
  AudioPart,
  BatchInterruptError,
  ChunkStrategy,
  ContentPart,
  DocumentPart,
  ImagePart,
  InferSchemaType,
  InterruptDefinition,
  InferToolInput,
  InferToolOutput,
  InputSchemaOf,
  Interrupt,
  InterruptBinding,
  ItemInterruptError,
  ModelMessage,
  NoSchema,
  RunAgentResumeItem,
  SchemaInput,
  StreamChunk,
  StructuredOutputPart,
  UIResourcePart,
  VideoPart,
} from '@tanstack/ai/client'
import type { ByokClient } from './byok'
import type { ConnectionAdapter } from './connection-adapters'
import type { AIDevtoolsClientMetadata } from './devtools'
import type { ChatDevtoolsBridgeFactory } from './devtools-noop'

export type { StructuredOutputPart }

export interface ChatResumeState {
  threadId: string
  runId: string
}

export type ChatPendingInterrupt = Interrupt

export interface ChatResumeSnapshot {
  resumeState: ChatResumeState
  pendingInterrupts?: Array<ChatPendingInterrupt>
}

export type InterruptItemStatus =
  | 'pending'
  | 'validating'
  | 'staged'
  | 'submitting'
  | 'error'

export interface BoundInterruptBase {
  readonly id: string
  readonly interruptId: string
  readonly reason: string
  readonly message?: string
  readonly responseSchema?: Readonly<Record<string, unknown>>
  readonly expiresAt?: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly threadId: string
  readonly interruptedRunId: string
  readonly generation: number
  readonly status: InterruptItemStatus
  readonly errors: ReadonlyArray<ItemInterruptError>
  /** @deprecated Use `errors[0]`. */
  readonly error?: ItemInterruptError
  readonly canResolve: boolean
  cancel: () => void
  clearResolution: () => void
}

export interface GenericAGUIInterrupt extends BoundInterruptBase {
  readonly kind: 'generic'
  readonly binding: Readonly<Extract<InterruptBinding, { kind: 'generic' }>>
  resolveInterrupt: (payload: unknown) => void
}

type InterruptResponseInput<TDefinition> =
  TDefinition extends InterruptDefinition<any, any, infer TResponseSchema, any>
    ? InferSchemaType<TResponseSchema>
    : never

type RegisteredGenericInterruptFor<
  TDefinition extends InterruptDefinition<any, any, any, any>,
> =
  TDefinition extends InterruptDefinition<
    infer TDefinitionId,
    any,
    any,
    infer TPayload
  >
    ? BoundInterruptBase & {
        readonly kind: 'generic'
        readonly definitionId: TDefinitionId
        readonly key: string
        readonly payload: TPayload | undefined
        readonly binding: Readonly<
          Extract<InterruptBinding, { kind: 'generic' }> & {
            definitionId: TDefinitionId
            key: string
            batchIndex: number
          }
        >
        resolveInterrupt: (
          response: InterruptResponseInput<TDefinition>,
        ) => void
      }
    : never

export type RegisteredGenericInterrupt<
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
> = TInterrupts[number] extends infer TDefinition
  ? TDefinition extends InterruptDefinition<any, any, any, any>
    ? RegisteredGenericInterruptFor<TDefinition>
    : never
  : never

/** A bound generic interrupt for one `defineInterrupt()` definition. */
export type GenericInterrupt<
  TDefinition extends InterruptDefinition<any, any, any, any>,
> = RegisteredGenericInterruptFor<TDefinition>

export interface UnboundInterrupt extends Omit<
  BoundInterruptBase,
  'cancel' | 'clearResolution'
> {
  readonly kind: 'unbound'
  readonly binding?: undefined
  readonly canResolve: false
}

type ApprovalBranchSchema<TTool, TBranch extends 'approve' | 'reject'> =
  ApprovalSchemaOf<TTool> extends infer TApproval
    ? TApproval extends { approve?: SchemaInput; reject?: SchemaInput }
      ? Exclude<TApproval[TBranch], undefined>
      : TApproval extends SchemaInput
        ? TApproval
        : never
    : never

type ApprovalEdits<TTool> =
  InputSchemaOf<TTool> extends NoSchema
    ? { editedArgs?: never }
    : { editedArgs?: InferToolInput<TTool> }

type ApprovalPayload<TSchema> = [TSchema] extends [never]
  ? { payload?: never }
  : TSchema extends SchemaInput
    ? { payload: InferSchemaType<TSchema> }
    : { payload?: never }

type ApproveArguments<TTool> = [
  ApprovalBranchSchema<TTool, 'approve'>,
] extends [never]
  ? InputSchemaOf<TTool> extends NoSchema
    ? [options?: never]
    : [options?: ApprovalEdits<TTool> & { payload?: never }]
  : [
      options: ApprovalEdits<TTool> &
        ApprovalPayload<ApprovalBranchSchema<TTool, 'approve'>>,
    ]

type RejectArguments<TTool> = [ApprovalBranchSchema<TTool, 'reject'>] extends [
  never,
]
  ? [options?: never]
  : [
      options: { editedArgs?: never } & ApprovalPayload<
        ApprovalBranchSchema<TTool, 'reject'>
      >,
    ]

export type ToolApprovalInterrupt<TTool extends AnyClientTool = AnyClientTool> =
  TTool extends AnyClientTool
    ? BoundInterruptBase & {
        readonly kind: 'tool-approval'
        readonly binding: Readonly<
          Extract<InterruptBinding, { kind: 'tool-approval' }>
        >
        readonly toolName: TTool['name']
        readonly toolCallId: string
        readonly originalArgs: InferToolInput<TTool>
        resolveInterrupt: <TApproved extends boolean>(
          approved: TApproved,
          ...args: TApproved extends true
            ? ApproveArguments<TTool>
            : RejectArguments<TTool>
        ) => void
      }
    : never

type ApprovalInterrupts<TTools extends ReadonlyArray<AnyClientTool>> =
  TTools[number] extends infer TTool
    ? TTool extends AnyClientTool
      ? ApprovalCapabilityOf<TTool> extends true
        ? ToolApprovalInterrupt<TTool>
        : never
      : never
    : never

export type ChatInterrupt<
  TTools extends ReadonlyArray<AnyClientTool> = ReadonlyArray<AnyClientTool>,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> =
  | GenericAGUIInterrupt
  | RegisteredGenericInterrupt<TInterrupts>
  | UnboundInterrupt
  | ApprovalInterrupts<TTools>

export type ResolvableChatInterrupt<
  TTools extends ReadonlyArray<AnyClientTool> = ReadonlyArray<AnyClientTool>,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> =
  | GenericAGUIInterrupt
  | RegisteredGenericInterrupt<TInterrupts>
  | ApprovalInterrupts<TTools>

export type BoundInterrupts<
  TTools extends ReadonlyArray<AnyClientTool> = ReadonlyArray<AnyClientTool>,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> = ReadonlyArray<ChatInterrupt<TTools, TInterrupts>>

export interface ChatInterruptState<
  TTools extends ReadonlyArray<AnyClientTool> = ReadonlyArray<AnyClientTool>,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> {
  readonly interrupts: BoundInterrupts<TTools, TInterrupts>
  /** @deprecated Use `interrupts`. Same snapshot today. */
  readonly pendingInterrupts: BoundInterrupts<TTools, TInterrupts>
  readonly interruptErrors: ReadonlyArray<BatchInterruptError>
  readonly resuming: boolean
}

export interface ChatFetcherInput {
  messages: Array<UIMessage>
  data?: Record<string, unknown>
  threadId: string
  runId: string
  parentRunId?: string
  resume?: Array<RunAgentResumeItem>
}

export interface ChatFetcherOptions {
  /** Fires when `stop()` is called or the request is superseded. */
  signal: AbortSignal
  /** Extra request headers for this run (e.g. BYOK keys). */
  headers?: Record<string, string>
}

export type ChatFetcher = (
  input: ChatFetcherInput,
  options: ChatFetcherOptions,
) =>
  | Response
  | AsyncIterable<StreamChunk>
  | Promise<Response | AsyncIterable<StreamChunk>>

export type DistributedOmit<
  TObject,
  TKeys extends keyof any,
> = TObject extends unknown ? Omit<TObject, TKeys> : never

export type ChatTransport =
  | { connection: ConnectionAdapter; fetcher?: never }
  | { fetcher: ChatFetcher; connection?: never }

export type ToolCallState =
  | 'awaiting-input'
  | 'input-streaming'
  | 'input-complete'
  | 'approval-requested'
  | 'approval-responded'
  | 'complete'
  | 'error'

export type ToolResultState = 'streaming' | 'complete' | 'error'

export type ChatClientState = 'ready' | 'submitted' | 'streaming' | 'error'

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

export interface MultimodalContent {
  content: string | Array<ContentPart>
  id?: string
  metadata?: Record<string, any>
}

export type WhenBusy = 'queue' | 'drop' | 'interrupt'

export type QueueBusyReason = 'streaming' | 'sendInFlight' | 'draining'

export interface QueuedMessage {
  id: string
  content: string | MultimodalContent
  createdAt: number
}

export interface QueueConfig {
  whenBusy?: WhenBusy
  drain?: 'fifo' | 'batch'
  /** Max queued items. Unlimited when omitted. `0` means never queue. */
  maxSize?: number
  onOverflow?: 'reject' | 'drop-oldest'
}

export type QueueStrategy = (ctx: {
  pending: QueuedMessage
  busyReason: QueueBusyReason
  queued: ReadonlyArray<QueuedMessage>
}) => { action: WhenBusy }

/** A `WhenBusy` shorthand, a full config, or a strategy function. */
export type QueueOption = WhenBusy | QueueConfig | QueueStrategy

/** Per-call overrides for `sendMessage`. */
export interface SendMessageOptions {
  /** Overrides the configured `whenBusy` for this one send. */
  whenBusy?: WhenBusy
  body?: Record<string, any>
}

export interface TextPart {
  type: 'text'
  content: string
}

type ToolCallPartForTool<T> = T extends AnyClientTool
  ? {
      type: 'tool-call'
      id: string
      name: T['name']
      arguments: string // JSON string (may be incomplete)
      /** Parsed tool input (typed from inputSchema) */
      input?: InferToolInput<T>
      state: ToolCallState
      /** Tool execution output (for client tools or after approval) */
      output?: InferToolOutput<T>
    } & (NonNullable<T['needsApproval']> extends true
      ? {
          approval?: {
            id: string
            needsApproval: boolean
            approved?: boolean
          }
        }
      : // Tools without `needsApproval: true` never carry an approval field.
        // `& unknown` is a no-op intersection (adds nothing).
        unknown)
  : never

type UntypedToolCallPart = {
  type: 'tool-call'
  id: string
  name: string
  arguments: string
  input?: any
  state: ToolCallState
  approval?: {
    id: string
    needsApproval: boolean
    approved?: boolean
  }
  output?: any
}

export type ToolCallPart<TTools extends ReadonlyArray<AnyClientTool> = any> =
  // Check if we have a concrete tools array (not 'any' or 'never')
  [TTools] extends [never]
    ? UntypedToolCallPart
    : unknown extends TTools
      ? UntypedToolCallPart
      : TTools extends ReadonlyArray<infer Tool>
        ? Tool extends AnyClientTool
          ? ToolCallPartForTool<Tool>
          : UntypedToolCallPart
        : UntypedToolCallPart

export interface ToolResultPart {
  type: 'tool-result'
  id?: string
  name?: string
  toolCallId: string
  content: string | Array<ContentPart>
  state: ToolResultState
  error?: string // Error message if state is "error"
  metadata?: Record<string, unknown>
  createdAt?: Date
}

export interface ThinkingPart {
  type: 'thinking'
  content: string
}

export type MessagePart<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TData = unknown,
> =
  | TextPart
  | ImagePart
  | AudioPart
  | VideoPart
  | DocumentPart
  | ToolCallPart<TTools>
  | ToolResultPart
  | ThinkingPart
  | StructuredOutputPart<TData>
  | UIResourcePart

export interface UIMessage<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TData = unknown,
> {
  id: string
  role: 'system' | 'user' | 'assistant'
  name?: string
  parts: Array<MessagePart<TTools, TData>>
  createdAt?: Date
  metadata?: Record<string, any>
}

export interface ChatStorageAdapter<TValue> {
  getItem: (
    id: string,
  ) => TValue | null | undefined | Promise<TValue | null | undefined>
  setItem: (id: string, value: TValue) => void | Promise<void>
  removeItem: (id: string) => void | Promise<void>
}

export interface ChatPersistedState<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> {
  messages: Array<UIMessage<TTools>>
  /** Present while a run is in flight or paused on an interrupt; absent otherwise. */
  resume?: ChatResumeSnapshot
}

export interface ChatClientPersistence<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> {
  getItem: (
    id: string,
  ) =>
    | ChatPersistedState<TTools>
    | Array<UIMessage<TTools>>
    | null
    | undefined
    | Promise<
        ChatPersistedState<TTools> | Array<UIMessage<TTools>> | null | undefined
      >
  setItem: (
    id: string,
    state: ChatPersistedState<TTools>,
  ) => void | Promise<void>
  removeItem: (id: string) => void | Promise<void>
}

export type ChatPersistenceOption<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> = boolean | ChatClientPersistence<TTools>

export type ChatPersistenceOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> =
  | {
      persistence: true
      threadId: string
    }
  | {
      persistence: ChatClientPersistence<TTools>
      threadId: string
    }
  | {
      persistence?: false | undefined
      threadId?: string
    }

type IsUnknown<T> = unknown extends T
  ? [T] extends [unknown]
    ? true
    : false
  : false

type KnownContext<T> = IsUnknown<T> extends true ? never : T

type MergeContext<TLeft, TRight> = [TLeft] extends [never]
  ? TRight
  : [TRight] extends [never]
    ? TLeft
    : TLeft & TRight

type UnionToIntersection<T> = [T] extends [never]
  ? never
  : (T extends unknown ? (value: T) => void : never) extends (
        value: infer TIntersection,
      ) => void
    ? TIntersection
    : never

type DefinedContext<T> = Exclude<T, undefined>

type ContextFromExecute<T> = T extends (...args: any) => any
  ? NonNullable<Parameters<T>[1]> extends { context: infer TContext }
    ? KnownContext<TContext>
    : never
  : never

type ContextFromClientTool<T> = T extends AnyClientTool
  ? T extends { execute?: infer TExecute }
    ? ContextFromExecute<TExecute>
    : never
  : never

type RequiredContextFromClientToolUnion<T> = T extends unknown
  ? undefined extends ContextFromClientTool<T>
    ? never
    : ContextFromClientTool<T>
  : never

type ContextFromClientToolUnion<T> = [
  UnionToIntersection<DefinedContext<ContextFromClientTool<T>>>,
] extends [never]
  ? never
  : [RequiredContextFromClientToolUnion<T>] extends [never]
    ? UnionToIntersection<DefinedContext<ContextFromClientTool<T>>> | undefined
    : UnionToIntersection<DefinedContext<ContextFromClientTool<T>>>

type ContextFromClientTools<TTools> =
  IsUnknown<TTools> extends true
    ? never
    : TTools extends readonly [infer THead, ...infer TTail]
      ? MergeContext<
          ContextFromClientTool<THead>,
          ContextFromClientTools<TTail>
        >
      : TTools extends ReadonlyArray<infer TItem>
        ? ContextFromClientToolUnion<TItem>
        : never

export type InferredClientContext<TTools> = [
  ContextFromClientTools<TTools>,
] extends [never]
  ? unknown
  : ContextFromClientTools<TTools>

export type ClientContextOptionFromTools<TTools, TContext> = [
  ContextFromClientTools<TTools>,
] extends [never]
  ? { context?: TContext }
  : undefined extends ContextFromClientTools<TTools>
    ? { context?: TContext & ContextFromClientTools<TTools> }
    : { context: TContext & ContextFromClientTools<TTools> }

export interface ChatClientBaseOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = unknown,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> {
  initialMessages?: Array<UIMessage<TTools>>

  initialResumeSnapshot?: ChatResumeSnapshot

  forwardedProps?: Record<string, any>

  body?: Record<string, any>

  byok?: ByokClient

  byokProvider?: () => string | undefined

  context?: TContext

  onResponse?: (response?: Response) => void | Promise<void>

  onChunk?: (chunk: StreamChunk) => void

  onFinish?: (message: UIMessage<TTools>) => void

  onError?: (error: Error) => void

  onMessagesChange?: (messages: Array<UIMessage<TTools>>) => void

  onLoadingChange?: (isLoading: boolean) => void

  onErrorChange?: (error: Error | undefined) => void

  onStatusChange?: (status: ChatClientState) => void

  onSubscriptionChange?: (isSubscribed: boolean) => void

  onConnectionStatusChange?: (status: ConnectionStatus) => void

  onSessionGeneratingChange?: (isGenerating: boolean) => void

  queue?: QueueOption

  onQueueChange?: (queue: Array<QueuedMessage>) => void

  onResumeStateChange?: (
    resumeState: ChatResumeState | null,
    pendingInterrupts: BoundInterrupts<TTools, TInterrupts>,
  ) => void

  onRunIdChange?: (runId: string | null) => void

  onInterruptStateChange?: (
    state: ChatInterruptState<TTools, TInterrupts>,
    context: { source: 'hydrate' | 'live' },
  ) => void

  onCustomEvent?: (
    eventType: string,
    data: unknown,
    context: { toolCallId?: string },
  ) => void

  tools?: TTools

  /** First-party generic interrupts this client can type and resolve. */
  interrupts?: TInterrupts

  devtools?: Partial<AIDevtoolsClientMetadata>

  devtoolsBridgeFactory?: ChatDevtoolsBridgeFactory

  streamProcessor?: {
    chunkStrategy?: ChunkStrategy
  }
}

export type ChatClientOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = InferredClientContext<TTools>,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>> =
    readonly [],
> = DistributedOmit<
  ChatClientBaseOptions<TTools, TContext, TInterrupts>,
  'context'
> &
  ClientContextOptionFromTools<TTools, TContext> &
  ChatTransport &
  ChatPersistenceOptions<TTools>

export interface ChatRequestBody {
  messages: Array<ModelMessage>
  data?: Record<string, any>
}

export function clientTools<const T extends Array<AnyClientTool>>(
  ...tools: T
): T {
  return tools
}

export function createChatClientOptions<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
>(
  options: ChatClientOptions<TTools, TContext, TInterrupts>,
): ChatClientOptions<TTools, TContext, TInterrupts> {
  return options
}

export type InferChatMessages<T> =
  T extends ChatClientOptions<infer TTools, any>
    ? Array<UIMessage<TTools>>
    : never
