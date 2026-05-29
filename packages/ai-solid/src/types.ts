import type {
  AnyClientTool,
  InferSchemaType,
  ModelMessage,
  SchemaInput,
} from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ChatClientOptions,
  ChatClientState,
  ChatRequestBody,
  ClientContextOptionFromTools,
  ConnectionStatus,
  DistributedOmit,
  InferredClientContext,
  MultimodalContent,
  UIMessage,
} from '@tanstack/ai-client'
import type { Accessor } from 'solid-js'

// Re-export types from ai-client
export type { ChatRequestBody, MultimodalContent, UIMessage }

/**
 * Recursive partial — every property and every nested array element is optional.
 * Used to type the in-flight `partial` accessor while a structured-output
 * stream is still arriving.
 */
export type DeepPartial<T> =
  T extends ReadonlyArray<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

/**
 * Options for the useChat hook.
 *
 * This extends ChatClientOptions but omits the state change callbacks that are
 * managed internally by Solid signals:
 * - `onMessagesChange` - Managed by Solid signal (exposed as `messages`)
 * - `onLoadingChange` - Managed by Solid signal (exposed as `isLoading`)
 * - `onErrorChange` - Managed by Solid signal (exposed as `error`)
 * - `onStatusChange` - Managed by Solid signal (exposed as `status`)
 *
 * All other callbacks (onResponse, onChunk, onFinish, onError) are
 * passed through to the underlying ChatClient and can be used for side effects.
 *
 * When `outputSchema` is supplied, the hook returns typed `partial` and `final`
 * accessors. The schema is used purely for type inference; server-side
 * validation still runs against the schema passed to `chat({ outputSchema })`
 * on the server route.
 *
 * Note: Connection and body changes will recreate the ChatClient instance.
 * To update these options, remount the component or use a key prop.
 */
export type UseChatOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
> = DistributedOmit<
  ChatClientOptions<TTools, TContext>,
  | 'onMessagesChange'
  | 'onLoadingChange'
  | 'onErrorChange'
  | 'onStatusChange'
  | 'onSubscriptionChange'
  | 'onConnectionStatusChange'
  | 'onSessionGeneratingChange'
  | 'context'
  | 'devtools'
> & {
  /** Display options for TanStack AI Devtools. */
  devtools?: AIDevtoolsDisplayOptions
  live?: boolean
  /**
   * Standard-schema-compatible schema (Zod, Valibot, ArkType, or plain JSON
   * Schema). Used to infer the shape of `partial` and `final`.
   */
  outputSchema?: TSchema
} & ClientContextOptionFromTools<TTools, TContext>

/**
 * Discriminated return shape: when `outputSchema` is supplied, the hook adds
 * typed `partial` / `final` accessors; otherwise the return is unchanged.
 */
export type UseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
> = BaseUseChatReturn<
  TTools,
  TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown
> &
  (TSchema extends SchemaInput
    ? {
        /**
         * Live progressively-parsed structured output. Derived from the
         * latest assistant message's structured-output part.
         */
        partial: Accessor<DeepPartial<InferSchemaType<TSchema>>>
        /**
         * Final, schema-validated structured output. `null` until the latest
         * assistant turn's structured-output part transitions to `complete`.
         */
        final: Accessor<InferSchemaType<TSchema> | null>
      }
    : Record<never, never>)

interface BaseUseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TData = unknown,
> {
  /**
   * Current messages in the conversation. When `outputSchema` is supplied,
   * `messages()[i].parts.find(p => p.type === 'structured-output')` is typed
   * by the schema — `data: T`, `partial: DeepPartial<T>`.
   */
  messages: Accessor<Array<UIMessage<TTools, TData>>>

  /**
   * Send a message and get a response.
   * Can be a simple string or multimodal content with images, audio, etc.
   */
  sendMessage: (content: string | MultimodalContent) => Promise<void>

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
  isLoading: Accessor<boolean>

  /**
   * Current error, if any
   */
  error: Accessor<Error | undefined>

  /**
   * Set messages manually
   */
  setMessages: (messages: Array<UIMessage<TTools, TData>>) => void

  /**
   * Clear all messages
   */
  clear: () => void

  /**
   * Current generation status
   */
  status: Accessor<ChatClientState>

  /**
   * Whether the subscription loop is currently active
   */
  isSubscribed: Accessor<boolean>

  /**
   * Current connection lifecycle status
   */
  connectionStatus: Accessor<ConnectionStatus>

  /**
   * Whether the shared session is actively generating.
   * Derived from stream run events (RUN_STARTED / RUN_FINISHED / RUN_ERROR).
   * Unlike `isLoading` (request-local), this reflects shared generation
   * activity visible to all subscribers (e.g. across tabs/devices).
   */
  sessionGenerating: Accessor<boolean>
}

// Note: createChatClientOptions and InferChatMessages are now in @tanstack/ai-client
// and re-exported from there for convenience
