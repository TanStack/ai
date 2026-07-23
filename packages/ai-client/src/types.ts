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
import type { ConnectionAdapter } from './connection-adapters'
import type { AIDevtoolsClientMetadata } from './devtools'
import type { ChatDevtoolsBridgeFactory } from './devtools-noop'

export type { StructuredOutputPart }

export interface ChatResumeState {
  threadId: string
  runId: string
}

export type ChatPendingInterrupt = Interrupt

export interface ChatResumeSnapshotV1 {
  schemaVersion?: 1
  resumeState: ChatResumeState
  pendingInterrupts?: Array<ChatPendingInterrupt>
}

export interface ChatResumeSnapshotV2 {
  schemaVersion: 2
  resumeState: ChatResumeState
  pendingInterrupts?: Array<ChatPendingInterrupt>
}

export type ChatResumeSnapshot = ChatResumeSnapshotV1 | ChatResumeSnapshotV2

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
  /**
   * Whether the binding/schema allows resolution at hydrate time.
   * Does not flip on submit/expiry — gate UI on `status`, `resuming`, and
   * `errors` for those lifecycle states.
   */
  readonly canResolve: boolean
  cancel: () => void
  clearResolution: () => void
}

export interface GenericAGUIInterrupt extends BoundInterruptBase {
  readonly kind: 'generic'
  readonly binding: Readonly<Extract<InterruptBinding, { kind: 'generic' }>>
  resolveInterrupt: (payload: unknown) => void
}

/**
 * An interrupt that arrived on the stream carrying no resume binding this
 * client understands — no `tanstack:interruptBinding`, or one written at a
 * protocol version we don't recognise.
 *
 * These are surfaced rather than hidden so a UI can show that the run is
 * paused, but they are never resolvable here: something else owns them. A
 * workflow engine's durable approval projected into the same AG-UI stream
 * lands in this bucket, and resolving it through the chat resume path would
 * send an answer no one is waiting for. Render it, or route it to whatever
 * actually owns the pause.
 */
export interface UnboundInterrupt extends BoundInterruptBase {
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
        // A single generic call signature — not two overloads. Overloads break
        // editor autocomplete: a half-typed options literal (e.g.
        // `resolveInterrupt(true, { payload: {` ) satisfies neither overload,
        // so TS resolves no signature and offers no contextual completions.
        // Making `approved` a generic discriminant lets TS infer it from the
        // first argument and pick the matching branch for the rest params, so
        // `payload` / `editedArgs` / the correct schema's fields complete
        // per-branch (a plain union-of-tuples would offer both branches'
        // fields) while still enforcing the right shape.
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

// Client tools resolve through their `.client()` implementation (auto-run) or
// `addToolResult` — never as a bound interrupt. The `client-tool-execution`
// pause is handled internally and is intentionally absent from this public
// union.
export type ChatInterrupt<
  TTools extends ReadonlyArray<AnyClientTool> = ReadonlyArray<AnyClientTool>,
> = GenericAGUIInterrupt | UnboundInterrupt | ApprovalInterrupts<TTools>

export type BoundInterrupts<
  TTools extends ReadonlyArray<AnyClientTool> = ReadonlyArray<AnyClientTool>,
> = ReadonlyArray<ChatInterrupt<TTools>>

export interface ChatInterruptState<
  TTools extends ReadonlyArray<AnyClientTool> = ReadonlyArray<AnyClientTool>,
> {
  readonly interrupts: BoundInterrupts<TTools>
  /** @deprecated Use `interrupts`. Same snapshot today. */
  readonly pendingInterrupts: BoundInterrupts<TTools>
  readonly interruptErrors: ReadonlyArray<BatchInterruptError>
  readonly resuming: boolean
}

/**
 * `messages` is the full UIMessage history (not a delta). `data` is the
 * merged body — `ChatClientOptions.body` plus any per-call data passed to
 * `sendMessage(...)`. `threadId` / `runId` are the AG-UI correlation ids
 * the chat client uses to track this turn — forward them to your server
 * if it needs to correlate requests.
 */
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
}

/**
 * Direct function that performs a chat request. Mirrors
 * `GenerationFetcher`. Returns either a `Response` (SSE body parsed by the
 * chat client) or an `AsyncIterable<StreamChunk>` (yielded directly). May
 * return the value synchronously, as a `Promise`, or as an async generator
 * (`async function*`) — the chat client awaits whichever shape is returned.
 *
 * @example
 * ```ts
 * useChat({
 *   fetcher: ({ messages }, { signal }) =>
 *     chatFn({ data: { messages }, signal }),
 * })
 * ```
 */
export type ChatFetcher = (
  input: ChatFetcherInput,
  options: ChatFetcherOptions,
) =>
  | Response
  | AsyncIterable<StreamChunk>
  | Promise<Response | AsyncIterable<StreamChunk>>

/**
 * Distributive `Omit` — applies `Omit<O, K>` per branch of a union so
 * discriminated unions survive omission. Plain `Omit` collapses unions
 * into a single object shape, which would erase the `ChatTransport` XOR
 * when framework hooks omit React-managed callbacks from
 * `ChatClientOptions`.
 */
export type DistributedOmit<
  TObject,
  TKeys extends keyof any,
> = TObject extends unknown ? Omit<TObject, TKeys> : never

/**
 * Discriminated union enforcing that exactly one of `connection` or
 * `fetcher` is provided. Mirrors `GenerationTransport`.
 */
export type ChatTransport =
  | { connection: ConnectionAdapter; fetcher?: never }
  | { fetcher: ChatFetcher; connection?: never }

/**
 * Tool call states - track the lifecycle of a tool call
 */
export type ToolCallState =
  | 'awaiting-input' // Received start but no arguments yet
  | 'input-streaming' // Partial arguments received
  | 'input-complete' // All arguments received
  | 'approval-requested' // Waiting for user approval
  | 'approval-responded' // User has approved/denied
  | 'complete' // Result is complete
  | 'error' // Tool execution failed (terminal)

/**
 * Tool result states - track the lifecycle of a tool result
 */
export type ToolResultState =
  | 'streaming' // Placeholder for future streamed output
  | 'complete' // Result is complete
  | 'error' // Error occurred

/**
 * ChatClient state - track the lifecycle of a chat
 */
export type ChatClientState = 'ready' | 'submitted' | 'streaming' | 'error'

/**
 * Connection lifecycle state for the subscription loop.
 */
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

/**
 * Multimodal content input for sending messages with rich media.
 * Allows sending text, images, audio, video, and documents to the LLM.
 *
 * @example
 * ```ts
 * // Send an image with a question
 * client.sendMessage({
 *   content: [
 *     { type: 'text', content: 'What is in this image?' },
 *     { type: 'image', source: { type: 'url', value: 'https://example.com/photo.jpg' } }
 *   ],
 *   id: 'custom-message-id' // optional
 * })
 * ```
 */
export interface MultimodalContent {
  /**
   * The content of the message.
   * Can be a simple string or an array of content parts for multimodal messages.
   */
  content: string | Array<ContentPart>
  /**
   * Optional custom ID for the message.
   * If not provided, a unique ID will be generated.
   */
  id?: string
}

/**
 * Action taken when `sendMessage` is called while the client is busy
 * (streaming, claiming a send, or draining the queue).
 * - `queue`: hold the message; it auto-sends when the current run settles
 *   **successfully**.
 * - `drop`: ignore the send (promise still resolves; does not throw).
 * - `interrupt`: abort the current stream and send immediately. Unlike
 *   `stop()`, does **not** flush already-queued messages — they still drain
 *   after the interrupting send settles successfully.
 */
export type WhenBusy = 'queue' | 'drop' | 'interrupt'

/**
 * Why the client is busy when a {@link QueueStrategy} runs.
 * - `streaming` — an LLM stream is active (`isLoading`).
 * - `sendInFlight` — a send has claimed the client but is not yet loading.
 * - `draining` — the queue drain loop is delivering pending messages.
 */
export type QueueBusyReason = 'streaming' | 'sendInFlight' | 'draining'

/**
 * A user message held in the send queue while a stream is active.
 * Rendered separately from `messages`; cancellable via `cancelQueued(id)`
 * until it drains.
 */
export interface QueuedMessage {
  id: string
  content: string | MultimodalContent
  createdAt: number
}

/**
 * Declarative queue policy.
 */
export interface QueueConfig {
  /**
   * Action when the client is busy (streaming, claiming a send, or draining).
   * Default `'queue'`.
   */
  whenBusy?: WhenBusy
  /**
   * How queued items leave the queue.
   * - `'fifo'`: one at a time, in order (default).
   * - `'batch'`: merge all queued items into one send when the run settles
   *   successfully.
   */
  drain?: 'fifo' | 'batch'
  /** Max queued items. Unlimited when omitted. `0` means never queue. */
  maxSize?: number
  /**
   * Behavior when `maxSize` is reached. Default `'reject'`.
   * `'reject'` silently discards the new send (does not throw);
   * `'drop-oldest'` evicts the oldest queued item to make room.
   * Only meaningful when `maxSize` is set.
   */
  onOverflow?: 'reject' | 'drop-oldest'
}

/**
 * Escape hatch: decide the action for a single send. Drain stays FIFO for the
 * function form (no `batch` via function). Per-call `sendOptions.whenBusy`
 * overrides the strategy for that send.
 *
 * Actions match {@link WhenBusy}: `'queue' | 'drop' | 'interrupt'`. Concurrent
 * streams are not supported. `pending.id` is the id that will be stored if the
 * action is `'queue'` (safe to pass to `cancelQueued`).
 */
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
}

/**
 * Message parts - building blocks of UIMessage
 */
export interface TextPart {
  type: 'text'
  content: string
}

/**
 * Helper type that creates a tool-call part for a specific tool.
 * This is a conditional type to enable proper distribution over union types,
 * creating a discriminated union where `name` is the discriminant.
 */
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
          /**
           * Approval metadata — present only on tools defined with
           * `needsApproval: true`. Populated once the call reaches
           * `state: 'approval-requested'`. `needsApproval` is an optional
           * property on the tool, so we index into it (rather than
           * `T extends { needsApproval: true }`, which an optional property
           * never satisfies) and strip `undefined` before comparing to `true`.
           */
          approval?: {
            id: string // Unique approval ID
            needsApproval: boolean // Always true if present
            approved?: boolean // User's decision (undefined until responded)
          }
        }
      : // Tools without `needsApproval: true` never carry an approval field.
        // `& unknown` is a no-op intersection (adds nothing).
        unknown)
  : never

/**
 * Fallback tool-call part type when tools are not typed
 */
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

/**
 * Tool call part that creates a proper discriminated union.
 * When TTools is typed, checking `part.name === 'toolName'` will narrow
 * `part.output` to the correct type for that tool.
 *
 * The discriminant is `name`, so code like:
 * ```ts
 * if (part.name === 'recommendGuitar') {
 *   // part.output is now typed to the recommendGuitar tool's output
 * }
 * ```
 */
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
  toolCallId: string
  content: string | Array<ContentPart>
  state: ToolResultState
  error?: string // Error message if state is "error"
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

/**
 * UIMessage - Domain-specific message format optimized for building chat UIs
 * Contains parts that can be text, tool calls, or tool results.
 *
 * `TTools` narrows the tool-call/result part types based on the registered
 * tools. `TData` is the schema-inferred type for any `structured-output` part
 * on the message — defaulted to `unknown` so untyped consumers (the core
 * stream processor, the wire converter) don't need to thread a schema generic
 * everywhere; the hook layer (`useChat({ outputSchema })`) substitutes it on
 * the public return so `m.parts.find(p => p.type === 'structured-output').data`
 * is typed without manual casts.
 */
export interface UIMessage<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TData = unknown,
> {
  id: string
  role: 'system' | 'user' | 'assistant'
  parts: Array<MessagePart<TTools, TData>>
  createdAt?: Date
}

/**
 * A generic key/value storage adapter. `getItem` may be sync or async; the
 * chat persistence layer treats every call as best-effort. The provided
 * `localStoragePersistence` / `sessionStoragePersistence` / `indexedDBPersistence`
 * factories return one of these, and `ChatStorageAdapter<ChatPersistedState>`
 * is assignable to {@link ChatClientPersistence}.
 */
export interface ChatStorageAdapter<TValue> {
  getItem: (
    id: string,
  ) => TValue | null | undefined | Promise<TValue | null | undefined>
  setItem: (id: string, value: TValue) => void | Promise<void>
  removeItem: (id: string) => void | Promise<void>
}

/**
 * The single record a `ChatClientPersistence` adapter stores per chat. It folds
 * the two things that must survive a full page reload into one blob under one
 * key: the message transcript and the optional resume snapshot (which run to
 * rejoin / which interrupts to rehydrate). One adapter, one key — see
 * {@link ChatClientPersistence}.
 */
export interface ChatPersistedState<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> {
  messages: Array<UIMessage<TTools>>
  /** Present while a run is in flight or paused on an interrupt; absent otherwise. */
  resume?: ChatResumeSnapshot
}

/**
 * Storage adapter for durable chat state. A single adapter persists both the
 * message transcript and the resume snapshot as one {@link ChatPersistedState}
 * record, so a full page reload restores the conversation AND can rejoin an
 * in-flight run / rehydrate pending interrupts.
 *
 * For backward compatibility `getItem` may also return a bare `UIMessage[]`
 * (the legacy messages-only format); the client normalizes it to
 * `{ messages }`. `setItem` always writes the combined record.
 */
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

/**
 * Persistence configuration for the `persistence` option. Pass a bare
 * {@link ChatClientPersistence} adapter to persist everything (the transcript
 * plus the resume pointer), or this object form to pull the message lever.
 *
 * `messages: false` keeps the transcript OFF the client and persists only the
 * tiny resume pointer (which run to rejoin, which interrupts are pending), so
 * durability rejoin and interrupt restore still work while the server stays the
 * authoritative source of history. Big conversations then never hit
 * localStorage, avoiding the quota and parse cost. Defaults to `true`
 * (transcript cached client-side).
 */
export interface ChatPersistenceConfig<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> {
  store: ChatClientPersistence<TTools>
  /** Cache the transcript client-side. Default `true`. `false` = resume pointer only. */
  messages?: boolean
}

/** The `persistence` option: a bare adapter, or `{ store, messages? }`. */
export type ChatPersistenceOption<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> = ChatClientPersistence<TTools> | ChatPersistenceConfig<TTools>

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

/**
 * Base options for `ChatClient`, excluding the transport (`connection` or
 * `fetcher`) which is supplied separately via `ChatTransport` so the XOR
 * is preserved when composing the final `ChatClientOptions` type.
 */
export interface ChatClientBaseOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = unknown,
> {
  /**
   * Initial messages to populate the chat
   */
  initialMessages?: Array<UIMessage<TTools>>

  /**
   * Optional persistence for durable chat state, keyed by chat id. Pass a
   * {@link ChatClientPersistence} adapter to store the combined
   * {@link ChatPersistedState} record (messages + resume pointer), so a full
   * page reload restores the transcript, rehydrates pending interrupts, and
   * rejoins an in-flight run.
   *
   * To keep large transcripts off the client, pass `{ store, messages: false }`
   * ({@link ChatPersistenceConfig}) instead: only the tiny resume pointer is
   * cached, durability rejoin and interrupt restore still work, and the server
   * is the authoritative source of history. Use `initialResumeSnapshot` for a
   * host-supplied in-memory rehydrate instead.
   */
  persistence?: ChatPersistenceOption<TTools>

  /**
   * Optional storage-key override for this chat instance, and the devtools
   * instance id. Persistence keys on `threadId` by default; set `id` only when
   * you need the persisted record keyed separately from the wire thread.
   * Prefer a stable `threadId` for the common case.
   */
  id?: string

  /**
   * The conversation id for this chat, stable across sends and reloads. It is
   * the AG-UI thread key on the wire AND the key client persistence stores the
   * conversation under, so set a stable `threadId` to have a reload restore the
   * same conversation. If omitted, a unique thread id is generated per session.
   */
  threadId?: string

  /**
   * Initial resumable run state, useful when rehydrating a persisted client
   * after a full page reload. This restores the client-side interrupt
   * descriptors needed to send AG-UI resume entries.
   */
  initialResumeSnapshot?: ChatResumeSnapshot

  /**
   * Arbitrary client-controlled JSON forwarded to the server in the
   * AG-UI `RunAgentInput.forwardedProps` field. Use this for per-session
   * options like provider/model selection or feature flags that the
   * server endpoint should read.
   *
   * Replaces the legacy `body` option. If both are provided,
   * `forwardedProps` wins on key collision.
   */
  forwardedProps?: Record<string, any>

  /**
   * @deprecated Use `forwardedProps` instead. `body` continues to work
   * unchanged — its values are merged into the AG-UI
   * `RunAgentInput.forwardedProps` field on the wire and are also
   * mirrored under the legacy `data` field for servers that have not
   * migrated yet. Will be removed in a future major release.
   */
  body?: Record<string, any>

  /**
   * Client-local runtime context passed to client tool implementations.
   *
   * This value is not serialized to the server. Use `forwardedProps` for
   * explicit client-to-server handoff of serializable values.
   */
  context?: TContext

  /**
   * Callback when a response is received
   */
  onResponse?: (response?: Response) => void | Promise<void>

  /**
   * Callback when a stream chunk is received
   */
  onChunk?: (chunk: StreamChunk) => void

  /**
   * Callback when the response is finished
   */
  onFinish?: (message: UIMessage<TTools>) => void

  /**
   * Callback when an error occurs
   */
  onError?: (error: Error) => void

  /**
   * Callback when messages change
   */
  onMessagesChange?: (messages: Array<UIMessage<TTools>>) => void

  /**
   * Callback when loading state changes
   */
  onLoadingChange?: (isLoading: boolean) => void

  /**
   * Callback when error state changes
   */
  onErrorChange?: (error: Error | undefined) => void

  /**
   * Callback when chat status changes
   */
  onStatusChange?: (status: ChatClientState) => void

  /**
   * Callback when subscription lifecycle changes.
   * This is independent from request lifecycle (`isLoading`, `status`).
   */
  onSubscriptionChange?: (isSubscribed: boolean) => void

  /**
   * Callback when connection lifecycle changes.
   */
  onConnectionStatusChange?: (status: ConnectionStatus) => void

  /**
   * Callback when session generation activity changes.
   * Derived from stream run events (RUN_STARTED / RUN_FINISHED / RUN_ERROR).
   * Unlike `onLoadingChange` (request-local), this reflects shared generation
   * activity visible to all subscribers (e.g. across tabs/devices).
   */
  onSessionGeneratingChange?: (isGenerating: boolean) => void

  /**
   * Policy for messages sent while the client is busy (streaming, claiming
   * a send, or draining the queue). Accepts a `WhenBusy` string, a
   * `QueueConfig`, or a `QueueStrategy` function.
   * Default: `{ whenBusy: 'queue', drain: 'fifo' }`.
   * Queued items auto-send only after a **successful** settle; they are
   * discarded on error/abort, `stop()`, `clear()`, `unsubscribe()`, and
   * `reload()`.
   */
  queue?: QueueOption

  /**
   * Callback when the pending send queue changes (enqueue, cancel, drain,
   * or flush).
   */
  onQueueChange?: (queue: Array<QueuedMessage>) => void

  /**
   * Callback when resumable run state or pending interrupts change.
   */
  onResumeStateChange?: (
    resumeState: ChatResumeState | null,
    pendingInterrupts: BoundInterrupts<TTools>,
  ) => void

  /** Callback when the immutable interrupt state snapshot changes. */
  onInterruptStateChange?: (state: ChatInterruptState<TTools>) => void

  /**
   * Callback when a custom event is received from a server-side tool.
   * Custom events are emitted by tools using `context.emitCustomEvent()` during execution.
   *
   * @param eventType - The name of the custom event
   * @param data - The event payload data
   * @param context - Additional context including the toolCallId that emitted the event
   */
  onCustomEvent?: (
    eventType: string,
    data: unknown,
    context: { toolCallId?: string },
  ) => void

  /**
   * Client-side tools with execution logic
   * When provided, tools with execute functions will be called automatically
   */
  tools?: TTools

  /**
   * Devtools hook metadata for this client instance.
   */
  devtools?: Partial<AIDevtoolsClientMetadata>

  /**
   * Factory that constructs the devtools bridge. Default is a no-op
   * factory, which keeps `@tanstack/ai-client/devtools` (the heavy
   * bridge implementation) out of the main entry's bundle. Frameworks
   * that need live devtools should pass the real factory from
   * `@tanstack/ai-client/devtools`.
   */
  devtoolsBridgeFactory?: ChatDevtoolsBridgeFactory

  /**
   * Stream processing options (optional)
   * Configure chunking strategy
   */
  streamProcessor?: {
    /**
     * Strategy for when to emit text updates
     * Defaults to ImmediateStrategy (every chunk)
     */
    chunkStrategy?: ChunkStrategy
  }
}

/**
 * Options for `ChatClient`. Exactly one of `connection` or `fetcher` must be
 * provided — the type-level XOR is enforced via `ChatTransport`.
 */
export type ChatClientOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TContext = InferredClientContext<TTools>,
> = DistributedOmit<ChatClientBaseOptions<TTools, TContext>, 'context'> &
  ClientContextOptionFromTools<TTools, TContext> &
  ChatTransport

export interface ChatRequestBody {
  messages: Array<ModelMessage>
  data?: Record<string, any>
}

/**
 * Create a typed array of client tools with proper type inference.
 * This eliminates the need for `as const` when defining tool arrays.
 *
 * @example
 * ```ts
 * const tools = clientTools(
 *   myTool1.client(() => result1),
 *   myTool2.client(() => result2),
 * )
 *
 * // tools is now properly typed as a tuple with literal tool names
 * // This enables type narrowing when checking part.name === 'toolName'
 * ```
 */
export function clientTools<const T extends Array<AnyClientTool>>(
  ...tools: T
): T {
  return tools
}

/**
 * Helper to create typed chat client options
 * Use this to get proper type inference for messages
 *
 * @example
 * ```ts
 * const tools = clientTools(myTool1, myTool2)
 *
 * const chatOptions = createChatClientOptions({
 *   connection: fetchServerSentEvents('/api/chat'),
 *   tools,
 * })
 *
 * type MyMessages = InferChatMessages<typeof chatOptions>
 * ```
 */
export function createChatClientOptions<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(
  options: ChatClientOptions<TTools, TContext>,
): ChatClientOptions<TTools, TContext> {
  return options
}

/**
 * Extract the message type from chat options
 *
 * @example
 * ```ts
 * const chatOptions = createChatClientOptions({
 *   connection: fetchServerSentEvents('/api/chat'),
 *   tools: [myTool1, myTool2],
 * })
 *
 * type MyMessages = InferChatMessages<typeof chatOptions>
 * // MyMessages is now Array<UIMessage<[typeof myTool1, typeof myTool2]>>
 * ```
 */
export type InferChatMessages<T> =
  T extends ChatClientOptions<infer TTools, any>
    ? Array<UIMessage<TTools>>
    : never
