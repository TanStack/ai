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
import type { Signal } from '@angular/core'
import type { ReactiveOption } from './internal/to-reactive'

export type { ChatRequestBody, MultimodalContent, UIMessage }
export type { ReactiveOption }

/**
 * Recursive partial — every property and every nested array element is optional.
 * Used to type the in-flight `partial` value while a structured-output stream
 * is still arriving.
 */
export type DeepPartial<T> =
  T extends ReadonlyArray<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

/**
 * Options for {@link injectChat}.
 *
 * Mirrors the Vue `useChat` options, except:
 * - State-change callbacks are managed internally and exposed as signals.
 * - `body`, `forwardedProps`, and `live` accept a {@link ReactiveOption} so
 *   they can be a static value, a `Signal`, or a getter and stay reactive.
 */
export type InjectChatOptions<
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
  /**
   * Standard-schema-compatible schema (Zod, Valibot, ArkType, or JSON Schema).
   * Used to infer the shape of `partial` and `final`.
   */
  outputSchema?: TSchema
} & ClientContextOptionFromTools<TTools, ReactiveOption<TContext>>

/**
 * Return shape of {@link injectChat}. When `outputSchema` is supplied, adds
 * typed `partial` / `final` signals; otherwise the return is unchanged.
 */
export type InjectChatResult<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
> = BaseInjectChatResult<
  TTools,
  TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown
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
> {
  /** Current messages in the conversation. */
  messages: Signal<Array<UIMessage<TTools, TData>>>
  /** Send a message (string or multimodal content). */
  sendMessage: (content: string | MultimodalContent) => Promise<void>
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
