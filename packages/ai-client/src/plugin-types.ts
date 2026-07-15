// packages/ai-client/src/plugin-types.ts
import type { InferChatSchema, InferChatTools } from '@tanstack/ai'
import type {
  ChatPlugin,
  GenerationPlugin,
  PluginDefinition,
} from '@tanstack/ai/plugin'
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

/** Per-chat-plugin client options. */
export interface ChatPluginOptions {
  /** Client-executed tools for this chat plugin. */
  tools?: ReadonlyArray<AnyClientTool>
  /** Extra fields merged into this plugin's request body. */
  forwardedProps?: Record<string, any>
}

/**
 * Per-generation-plugin client options: an optional `onResult` transform (its
 * return type becomes the plugin surface's `result` type) plus extra
 * `forwardedProps` merged into the request body.
 */
export interface GenerationPluginClientOptions<TResult> {
  /**
   * Transform the raw backend result before it is stored on the surface.
   * Return `undefined`/`null`/`void` to keep the raw result.
   */
  onResult?: (result: TResult) => unknown
  /** Extra fields merged into this plugin's request body. */
  forwardedProps?: Record<string, any>
}

/** Maps each declared plugin name to its per-plugin client options shape. */
export type PluginOptionsMap<TDef extends PluginDefinition<any>> = {
  [K in keyof TDef['~plugins'] & string]?: TDef['~plugins'][K] extends ChatPlugin<any>
    ? ChatPluginOptions
    : TDef['~plugins'][K] extends GenerationPlugin<any, infer TRes>
      ? GenerationPluginClientOptions<TRes>
      : never
}

/**
 * Reactive state callbacks forwarded into the underlying sub-clients'
 * constructors. Set by the framework hooks (not users) to wire up reactive
 * state. `ChatClient` and `GenerationClient` only accept these via their
 * constructors, so `PluginClient` threads them through at construction
 * time.
 */
export interface PluginClientCallbacks {
  /** Reactive state callbacks for each chat plugin's `ChatClient`. */
  chat?: (
    plugin: string,
  ) => Pick<
    ChatClientOptions,
    | 'onMessagesChange'
    | 'onLoadingChange'
    | 'onErrorChange'
    | 'onStatusChange'
    | 'onSubscriptionChange'
    | 'onConnectionStatusChange'
    | 'onSessionGeneratingChange'
  >
  /** Reactive state callbacks for each generation plugin's `GenerationClient`. */
  oneShot?: (plugin: string) => Pick<
    GenerationClientOptions<any, any, any>,
    'onResultChange' | 'onLoadingChange' | 'onErrorChange' | 'onStatusChange'
  >
}

/** Options for PluginClient (framework-agnostic core). */
export interface PluginClientOptions<TDef extends PluginDefinition<any>> {
  plugin: TDef
  connection: ConnectConnectionAdapter
  id?: string
  threadId?: string
  /**
   * Per-plugin options, keyed by the plugin names declared on the definition.
   * Nested (rather than spread at the top level) so plugin names can never
   * collide with `connection`/`id`/`threadId`/`callbacks`.
   */
  plugins?: PluginOptionsMap<TDef>
  /** Set by framework hooks (not users) to wire up reactive state. */
  callbacks?: PluginClientCallbacks
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

/** The return type of a chat plugin's captured callback. */
type ChatPluginReturn<TPlugin> =
  TPlugin extends ChatPlugin<infer TCallback>
    ? TCallback extends (...args: Array<any>) => infer TRet
      ? TRet
      : never
    : never

/**
 * Client-tool-shaped tuple recovered from a chat plugin's captured tools.
 * Drives the `messages` tool-call/result part typing on that chat surface.
 */
export type ChatToolsOfPlugin<TPlugin> = ToClientTools<
  NonNullable<InferChatTools<ChatPluginReturn<TPlugin>>>
>

/** Structured-output schema recovered from a chat plugin (or `undefined`). */
export type ChatSchemaOfPlugin<TPlugin> = InferChatSchema<
  ChatPluginReturn<TPlugin>
>

/** The base chat plugin surface — mirrors the frameworks' useChat return. */
export interface PluginChatSurfaceBase<
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
 * The chat plugin surface. Extends {@link PluginChatSurfaceBase} and,
 * when the callback declared an `outputSchema` (`TSchema extends
 * SchemaInput`), adds the typed structured-output fields `partial` / `final`
 * — mirroring the framework `useChat` hooks' conditional return.
 */
export type PluginChatSurface<
  TTools extends ReadonlyArray<AnyClientTool> = [],
  TSchema = undefined,
> = PluginChatSurfaceBase<TTools> & {
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

/** The generation plugin surface — a typed run/result pair. */
export interface PluginGenerationSurface<TInput, TResult> {
  /** Invoke the plugin. Resolves with its (transformed) result, or null. */
  run: (input: TInput) => Promise<TResult | null>
  result: TResult | null
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
  stop: () => void
  reset: () => void
}

/**
 * The stored `result` type for a generation plugin `K`: the `onResult`
 * transform's return type when the options declare one, otherwise the raw
 * result type captured from the plugin's `execute`.
 */
export type PluginResultType<
  TOptions,
  TPluginName extends string,
  TResult,
> = TOptions extends { plugins?: infer TPluginOptions }
  ? TPluginName extends keyof TPluginOptions
    ? NonNullable<TPluginOptions[TPluginName]> extends { onResult?: infer TFn }
      ? InferGenerationOutput<TResult, TFn>
      : TResult
    : TResult
  : TResult

/**
 * The full typed system returned by usePlugin: one surface per declared
 * plugin. Chat plugins get the conversational surface (tools and structured
 * output inferred from their callback); generation plugins get a typed
 * `run`/`result` surface (input from their schema, result from `execute`,
 * transformed by the options' `onResult` when declared).
 */
export type PluginSystem<
  TDef extends PluginDefinition<any>,
  /**
   * The user's options object. Its per-plugin `onResult` transforms drive
   * each generation plugin's `result` type. Defaults to `unknown` (no
   * transforms).
   */
  TOptions = unknown,
> = {
  [K in keyof TDef['~plugins'] &
    string]: TDef['~plugins'][K] extends ChatPlugin<any>
    ? PluginChatSurface<
        ChatToolsOfPlugin<TDef['~plugins'][K]>,
        ChatSchemaOfPlugin<TDef['~plugins'][K]>
      >
    : TDef['~plugins'][K] extends GenerationPlugin<infer TInput, infer TResult>
      ? PluginGenerationSurface<TInput, PluginResultType<TOptions, K, TResult>>
      : never
}
