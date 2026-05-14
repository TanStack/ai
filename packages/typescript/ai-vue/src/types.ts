import type {
  AnyClientTool,
  InferSchemaType,
  ModelMessage,
  SchemaInput,
} from '@tanstack/ai'
import type {
  ChatClientOptions,
  ChatClientState,
  ChatRequestBody,
  ConnectionStatus,
  MultimodalContent,
  UIMessage,
} from '@tanstack/ai-client'
import type { DeepReadonly, ShallowRef } from 'vue'

// Re-export types from ai-client
export type { ChatRequestBody, MultimodalContent, UIMessage }

/**
 * Recursive partial — every property and every nested array element is optional.
 * Used to type the in-flight `partial` value the composable exposes while a
 * structured output stream is still arriving.
 */
export type DeepPartial<T> = T extends ReadonlyArray<infer U>
  ? Array<DeepPartial<U>>
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

/**
 * Options for the useChat composable.
 *
 * This extends ChatClientOptions but omits the state change callbacks that are
 * managed internally by Vue refs:
 * - `onMessagesChange` - Managed by Vue ref (exposed as `messages`)
 * - `onLoadingChange` - Managed by Vue ref (exposed as `isLoading`)
 * - `onErrorChange` - Managed by Vue ref (exposed as `error`)
 * - `onStatusChange` - Managed by Vue ref (exposed as `status`)
 *
 * All other callbacks (onResponse, onChunk, onFinish, onError) are
 * passed through to the underlying ChatClient and can be used for side effects.
 *
 * When `outputSchema` is supplied, the composable returns typed `partial` and
 * `final` refs — `partial` is the live progressively-parsed object, `final`
 * snaps to the validated terminal payload. The schema is used purely for type
 * inference; server-side validation still runs against the schema passed to
 * `chat({ outputSchema })` on the server route.
 *
 * Note: Connection and body changes will recreate the ChatClient instance.
 * To update these options, remount the component or use a key prop.
 */
export type UseChatOptions<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
> = Omit<
  ChatClientOptions<TTools>,
  | 'onMessagesChange'
  | 'onLoadingChange'
  | 'onErrorChange'
  | 'onStatusChange'
  | 'onSubscriptionChange'
  | 'onConnectionStatusChange'
  | 'onSessionGeneratingChange'
> & {
  live?: boolean
  /**
   * Standard-schema-compatible schema (Zod, Valibot, ArkType, or plain JSON
   * Schema). Used to infer the shape of `partial` and `final`.
   */
  outputSchema?: TSchema
}

/**
 * Discriminated return shape: when `outputSchema` is supplied, the composable
 * adds typed `partial` / `final` refs; when it is omitted (default), the
 * return is unchanged.
 */
export type UseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
> = BaseUseChatReturn<TTools> &
  (TSchema extends SchemaInput
    ? {
        /**
         * Live progressively-parsed structured output. Updated from
         * `TEXT_MESSAGE_CONTENT` deltas via `parsePartialJSON`. Resets on
         * every new run.
         */
        partial: DeepReadonly<
          ShallowRef<DeepPartial<InferSchemaType<TSchema>>>
        >
        /**
         * Final, schema-validated structured output. `null` until the terminal
         * `structured-output.complete` event arrives. Resets on every new run.
         */
        final: DeepReadonly<ShallowRef<InferSchemaType<TSchema> | null>>
      }
    : Record<never, never>)

interface BaseUseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
> {
  /**
   * Current messages in the conversation
   */
  messages: DeepReadonly<ShallowRef<Array<UIMessage<TTools>>>>

  /**
   * Send a message and get a response.
   * Can be a simple string or multimodal content with images, audio, etc.
   */
  sendMessage: (content: string | MultimodalContent) => Promise<void>

  /**
   * Append a message to the conversation
   */
  append: (message: ModelMessage | UIMessage<TTools>) => Promise<void>

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
  isLoading: DeepReadonly<ShallowRef<boolean>>

  /**
   * Current error, if any
   */
  error: DeepReadonly<ShallowRef<Error | undefined>>

  /**
   * Set messages manually
   */
  setMessages: (messages: Array<UIMessage<TTools>>) => void

  /**
   * Clear all messages
   */
  clear: () => void

  /**
   * Current generation status
   */
  status: DeepReadonly<ShallowRef<ChatClientState>>

  /**
   * Whether the subscription loop is currently active
   */
  isSubscribed: DeepReadonly<ShallowRef<boolean>>

  /**
   * Current connection lifecycle status
   */
  connectionStatus: DeepReadonly<ShallowRef<ConnectionStatus>>

  /**
   * Whether the shared session is actively generating.
   * Derived from stream run events (RUN_STARTED / RUN_FINISHED / RUN_ERROR).
   * Unlike `isLoading` (request-local), this reflects shared generation
   * activity visible to all subscribers (e.g. across tabs/devices).
   */
  sessionGenerating: DeepReadonly<ShallowRef<boolean>>
}

// Note: createChatClientOptions and InferChatMessages are now in @tanstack/ai-client
// and re-exported from there for convenience
