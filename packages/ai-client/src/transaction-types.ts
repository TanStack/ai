// packages/ai-client/src/transaction-types.ts
import type { InferChatSchema, InferChatTools } from '@tanstack/ai'
import type {
  ChatVerb,
  OneShotVerb,
  TransactionDefinition,
} from '@tanstack/ai/transaction'
import type {
  AnyClientTool,
  InferSchemaType,
  ModelMessage,
  SchemaInput,
} from '@tanstack/ai/client'
import type { ConnectConnectionAdapter } from './connection-adapters.js'
import type {
  ChatClientOptions,
  ChatClientState,
  ConnectionStatus,
  MultimodalContent,
  UIMessage,
} from './types.js'
import type {
  GenerationClientOptions,
  GenerationClientState,
  InferGenerationOutput,
} from './generation-types.js'

/**
 * Live state of one sub-run inside a transaction run — a sibling verb the
 * server-side `execute` invoked via `ctx.call`. Demultiplexed from the
 * single SSE response by `TransactionClient`.
 */
export interface TransactionSubRun {
  runId: string
  /** The sub-verb's name in the transaction definition. */
  verb: string
  /** 0-based order in which the server started this sub-run. */
  index: number
  status: 'running' | 'success' | 'error'
  /** The sub-run's result, once it completes. */
  result: unknown
  /** Accumulated streamed text, for chat-verb sub-runs. */
  text: string
  error?: string
}

/** Per-chat-verb client options. */
export interface ChatVerbOptions {
  /** Client-executed tools for this chat verb. */
  tools?: ReadonlyArray<AnyClientTool>
  /** Extra fields merged into this verb's request body. */
  forwardedProps?: Record<string, any>
}

/**
 * Per-one-shot-verb client options: an optional `onResult` transform (its
 * return type becomes the verb surface's `result` type) plus extra
 * `forwardedProps` merged into the request body.
 */
export interface OneShotVerbOptions<TResult> {
  /**
   * Transform the raw backend result before it is stored on the surface.
   * Return `undefined`/`null`/`void` to keep the raw result.
   */
  onResult?: (result: TResult) => unknown
  /** Extra fields merged into this verb's request body. */
  forwardedProps?: Record<string, any>
}

/** Maps each declared verb name to its per-verb client options shape. */
export type VerbOptionsMap<TDef extends TransactionDefinition<any>> = {
  [K in keyof TDef['~verbs'] & string]?: TDef['~verbs'][K] extends ChatVerb<any>
    ? ChatVerbOptions
    : TDef['~verbs'][K] extends OneShotVerb<any, infer TRes>
      ? OneShotVerbOptions<TRes>
      : never
}

/**
 * Reactive state callbacks forwarded into the underlying sub-clients'
 * constructors. Set by the framework hooks (not users) to wire up reactive
 * state. `ChatClient` and `GenerationClient` only accept these via their
 * constructors, so `TransactionClient` threads them through at construction
 * time.
 */
export interface TransactionClientCallbacks {
  /** Reactive state callbacks for each chat verb's `ChatClient`. */
  chat?: (verb: string) => Pick<
    ChatClientOptions,
    | 'onMessagesChange'
    | 'onLoadingChange'
    | 'onErrorChange'
    | 'onStatusChange'
    | 'onSubscriptionChange'
    | 'onConnectionStatusChange'
    | 'onSessionGeneratingChange'
  >
  /** Reactive state callbacks for each one-shot verb's `GenerationClient`. */
  oneShot?: (verb: string) => Pick<
    GenerationClientOptions<any, any, any>,
    'onResultChange' | 'onLoadingChange' | 'onErrorChange' | 'onStatusChange'
  > & {
    /** Invoked whenever the verb's live sub-run state changes. */
    onSubRunsChange?: (subRuns: Array<TransactionSubRun>) => void
  }
}

/** Options for TransactionClient (framework-agnostic core). */
export interface TransactionClientOptions<
  TDef extends TransactionDefinition<any>,
> {
  transaction: TDef
  connection: ConnectConnectionAdapter
  id?: string
  threadId?: string
  /**
   * Per-verb options, keyed by the verb names declared on the definition.
   * Nested (rather than spread at the top level) so verb names can never
   * collide with `connection`/`id`/`threadId`/`callbacks`.
   */
  verbs?: VerbOptionsMap<TDef>
  /** Set by framework hooks (not users) to wire up reactive state. */
  callbacks?: TransactionClientCallbacks
}

/**
 * Recursive partial — every property and every nested array element is
 * optional. Types the in-flight `partial` value the chat surface exposes
 * while a structured-output stream is still arriving. Mirrors the
 * `DeepPartial` used by the framework `useChat` hooks.
 */
export type DeepPartial<T> =
  T extends ReadonlyArray<infer TItem>
    ? Array<DeepPartial<TItem>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

/**
 * Map a captured chat-callback tool (server / definition / client) to a
 * `definition`-shaped object so it satisfies the `AnyClientTool` constraint
 * on `UIMessage`/`ToolCallPart` **without** relaxing the core message types.
 *
 * The chat callback's `tools` are typically server (`.server()`) or bare
 * definition tools, whose `__toolSide` is `'server'` / `'definition'` —
 * `AnyClientTool` rejects `'server'`. We rebuild each tool as a
 * `'definition'`-side object, preserving the exact fields the `Infer*`
 * helpers read (`name`, `inputSchema`, `outputSchema`, `needsApproval`).
 */
type ToClientToolShape<TTool> = TTool extends {
  name: infer TName extends string
}
  ? {
      __toolSide: 'definition'
      name: TName
      description: string
      inputSchema?: TTool extends { inputSchema?: infer TIn } ? TIn : undefined
      outputSchema?: TTool extends { outputSchema?: infer TOut }
        ? TOut
        : undefined
      needsApproval?: TTool extends { needsApproval?: infer TNa } ? TNa : false
    }
  : never

/** Map a captured tool tuple to a client-tool-shaped tuple (see above). */
type ToClientTools<TTools> = TTools extends readonly [
  infer THead,
  ...infer TRest,
]
  ? [ToClientToolShape<THead>, ...ToClientTools<TRest>]
  : []

/** The return type of a chat verb's captured callback. */
type ChatVerbReturn<TVerb> =
  TVerb extends ChatVerb<infer TCallback>
    ? TCallback extends (...args: Array<any>) => infer TRet
      ? TRet
      : never
    : never

/**
 * Client-tool-shaped tuple recovered from a chat verb's captured tools.
 * Drives the `messages` tool-call/result part typing on that chat surface.
 */
export type ChatToolsOfVerb<TVerb> = ToClientTools<
  NonNullable<InferChatTools<ChatVerbReturn<TVerb>>>
>

/** Structured-output schema recovered from a chat verb (or `undefined`). */
export type ChatSchemaOfVerb<TVerb> = InferChatSchema<ChatVerbReturn<TVerb>>

/** The base chat verb surface — mirrors the frameworks' useChat return. */
export interface TransactionChatSurfaceBase<
  TTools extends ReadonlyArray<AnyClientTool> = [],
> {
  /** Current messages in the conversation. */
  messages: Array<UIMessage<TTools>>

  /**
   * Append a message to the conversation.
   */
  append: (message: ModelMessage | UIMessage<TTools>) => Promise<void>

  /**
   * Reload the last assistant message.
   */
  reload: () => Promise<void>

  /**
   * Stop the current response generation.
   */
  stop: () => void

  /**
   * Clear all messages.
   */
  clear: () => void

  /**
   * Set messages manually.
   */
  setMessages: (messages: Array<UIMessage<TTools>>) => void

  /**
   * Add the result of a client-side tool execution.
   */
  addToolResult: (result: {
    toolCallId: string
    tool: string
    output: any
    state?: 'output-available' | 'output-error'
    errorText?: string
  }) => Promise<void>

  /**
   * Respond to a tool approval request.
   */
  addToolApprovalResponse: (response: {
    id: string // approval.id, not toolCallId
    approved: boolean
  }) => Promise<void>

  /**
   * Whether a response is currently being generated.
   */
  isLoading: boolean

  /**
   * Current error, if any.
   */
  error: Error | undefined

  /**
   * Current status of the chat client.
   */
  status: ChatClientState

  /**
   * Whether the subscription loop is currently active.
   */
  isSubscribed: boolean

  /**
   * Current connection lifecycle status.
   */
  connectionStatus: ConnectionStatus

  /**
   * Whether the shared session is actively generating.
   */
  sessionGenerating: boolean
}

/**
 * The chat verb surface. Extends {@link TransactionChatSurfaceBase} and,
 * when the callback declared an `outputSchema` (`TSchema extends
 * SchemaInput`), adds the typed structured-output fields `partial` / `final`
 * — mirroring the framework `useChat` hooks' conditional return.
 */
export type TransactionChatSurface<
  TTools extends ReadonlyArray<AnyClientTool> = [],
  TSchema = undefined,
> = TransactionChatSurfaceBase<TTools> & {
  /**
   * Send a message and get a response. Can be a simple string or multimodal
   * content with images, audio, etc.
   *
   * Resolves once the turn completes: to the schema-validated final
   * structured output (`InferSchemaType<TSchema> | null`) when the callback
   * declared an `outputSchema`, otherwise to the resulting messages array.
   */
  sendMessage: (
    content: string | MultimodalContent,
  ) => Promise<
    TSchema extends SchemaInput
      ? InferSchemaType<TSchema> | null
      : Array<UIMessage<TTools>>
  >
} & (TSchema extends SchemaInput
    ? {
        /**
         * Live, progressively-parsed structured output while the stream is
         * still arriving. Resets on every new run.
         */
        partial: DeepPartial<InferSchemaType<TSchema>>
        /**
         * Final, schema-validated structured output. `null` until the
         * terminal structured-output event arrives. Resets on every new run.
         */
        final: InferSchemaType<TSchema> | null
      }
    : Record<never, never>)

/** The one-shot verb surface — a typed run/result pair plus live sub-runs. */
export interface TransactionVerbSurface<TInput, TResult> {
  /** Invoke the verb. Resolves with its (transformed) result, or null. */
  run: (input: TInput) => Promise<TResult | null>
  result: TResult | null
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
  stop: () => void
  reset: () => void
  /**
   * Live state of the sub-runs the server-side `execute` spawned via
   * `ctx.call` during the current/last run, in start order. Empty for verbs
   * that don't compose siblings.
   */
  subRuns: Array<TransactionSubRun>
}

/**
 * The stored `result` type for a one-shot verb `K`: the `onResult`
 * transform's return type when the options declare one, otherwise the raw
 * result type captured from the verb's `execute`.
 */
export type VerbResultType<
  TOptions,
  TVerbName extends string,
  TResult,
> = TOptions extends { verbs?: infer TVerbOptions }
  ? TVerbName extends keyof TVerbOptions
    ? NonNullable<TVerbOptions[TVerbName]> extends { onResult?: infer TFn }
      ? InferGenerationOutput<TResult, TFn>
      : TResult
    : TResult
  : TResult

/**
 * The full typed system returned by useTransaction: one surface per declared
 * verb. Chat verbs get the conversational surface (tools and structured
 * output inferred from their callback); one-shot verbs get a typed
 * `run`/`result` surface (input from their schema, result from `execute`,
 * transformed by the options' `onResult` when declared).
 */
export type TransactionSystem<
  TDef extends TransactionDefinition<any>,
  /**
   * The user's options object. Its per-verb `onResult` transforms drive each
   * one-shot verb's `result` type. Defaults to `unknown` (no transforms).
   */
  TOptions = unknown,
> = {
  [K in keyof TDef['~verbs'] & string]: TDef['~verbs'][K] extends ChatVerb<any>
    ? TransactionChatSurface<
        ChatToolsOfVerb<TDef['~verbs'][K]>,
        ChatSchemaOfVerb<TDef['~verbs'][K]>
      >
    : TDef['~verbs'][K] extends OneShotVerb<infer TInput, infer TResult>
      ? TransactionVerbSurface<TInput, VerbResultType<TOptions, K, TResult>>
      : never
}
