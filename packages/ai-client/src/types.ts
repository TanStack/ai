import type {
  AnyClientTool,
  AudioPart,
  ChunkStrategy,
  ContentPart,
  DocumentPart,
  ImagePart,
  InferToolInput,
  InferToolOutput,
  ModelMessage,
  StreamChunk,
  StructuredOutputPart,
  UIResourcePart,
  VideoPart,
} from '@tanstack/ai/client'
import type { ConnectionAdapter } from './connection-adapters'
import type { AIDevtoolsClientMetadata } from './devtools'
import type { ChatDevtoolsBridgeFactory } from './devtools-noop'

export type { StructuredOutputPart } from '@tanstack/ai/client'

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

export interface ChatClientPersistence<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> {
  getItem: (
    id: string,
  ) =>
    | Array<UIMessage<TTools>>
    | null
    | undefined
    | Promise<Array<UIMessage<TTools>> | null | undefined>
  setItem: (
    id: string,
    messages: Array<UIMessage<TTools>>,
  ) => void | Promise<void>
  removeItem: (id: string) => void | Promise<void>
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
   * Optional persistence adapter for chat messages.
   */
  persistence?: ChatClientPersistence<TTools>

  /**
   * Unique identifier for this chat instance
   * Used for managing multiple chats
   */
  id?: string

  /**
   * Thread ID to use for this chat session. Persists across sends within
   * the session. If omitted, a unique thread ID is generated.
   */
  threadId?: string

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
