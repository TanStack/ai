import type {
  AnyClientTool,
  InferSchemaType,
  ModelMessage,
  SchemaInput,
  StreamChunk,
} from '@tanstack/ai'
import type {
  AIDevtoolsDisplayOptions,
  ChatClientOptions,
  ChatClientPersistence,
  ChatClientState,
  ChatFetcher,
  ChatRequestBody,
  ClientContextOptionFromTools,
  ConnectionAdapter,
  ConnectionStatus,
  DistributedOmit,
  InferredClientContext,
  MultimodalContent,
  UIMessage,
} from '@tanstack/ai-client'
import type { QRL, Signal } from '@qwik.dev/core'

export type { ChatRequestBody, MultimodalContent, UIMessage }

export type DeepPartial<T> =
  T extends ReadonlyArray<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

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
  | 'connection'
  | 'context'
  | 'devtools'
  | 'fetcher'
> & {
  /**
   * Qwik-friendly transport shortcut. Prefer this for SSR/resumable apps so
   * the non-serializable connection adapter can be created in the browser.
   */
  api?: string
  /**
   * Qwik-friendly client tool factory. Prefer this over `tools` when tool
   * implementations capture browser APIs such as localStorage.
   */
  tools$?: QRL<() => TTools | Promise<TTools>>
  /**
   * Qwik-friendly persistence factory. Persistence adapters contain methods
   * and therefore cannot survive SSR serialization when passed directly.
   */
  persistence$?: QRL<
    () => ChatClientPersistence<TTools> | Promise<ChatClientPersistence<TTools>>
  >
  /**
   * Qwik-friendly stream processor factory. Chunk strategies contain methods
   * and therefore cannot survive SSR serialization when passed directly.
   */
  streamProcessor$?: QRL<
    () =>
      | NonNullable<ChatClientOptions<TTools, TContext>['streamProcessor']>
      | Promise<
          NonNullable<ChatClientOptions<TTools, TContext>['streamProcessor']>
        >
  >
  /**
   * Qwik-friendly connection factory. Prefer this over `connection` when the
   * adapter contains functions, sockets, browser APIs, or other non-serializable
   * state.
   */
  connection$?: QRL<() => ConnectionAdapter | Promise<ConnectionAdapter>>
  /**
   * Qwik-friendly fetcher factory. Prefer this over `fetcher` when the fetcher
   * captures browser-only or non-serializable state.
   */
  fetcher$?: QRL<() => ChatFetcher | Promise<ChatFetcher>>
  /**
   * Qwik-friendly callback variants. Prefer `$` callbacks for inline handlers
   * and handlers that capture component state.
   */
  onResponse$?: QRL<(response?: Response) => void | Promise<void>>
  onChunk$?: QRL<(chunk: StreamChunk) => void | Promise<void>>
  onFinish$?: QRL<(message: UIMessage<TTools>) => void | Promise<void>>
  onError$?: QRL<(error: Error) => void | Promise<void>>
  onCustomEvent$?: QRL<
    (
      eventType: string,
      data: unknown,
      context: { toolCallId?: string },
    ) => void | Promise<void>
  >
  connection?: ConnectionAdapter
  fetcher?: ChatFetcher
  devtools?: AIDevtoolsDisplayOptions
  live?: boolean
  outputSchema?: TSchema
} & ClientContextOptionFromTools<TTools, TContext>

export type UseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
> = BaseUseChatReturn<
  TTools,
  TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown
> &
  (TSchema extends SchemaInput
    ? {
        partial: Signal<DeepPartial<InferSchemaType<TSchema>>>
        final: Signal<InferSchemaType<TSchema> | null>
      }
    : Record<never, never>)

interface BaseUseChatReturn<
  TTools extends ReadonlyArray<AnyClientTool> = any,
  TData = unknown,
> {
  messages: Signal<Array<UIMessage<TTools, TData>>>
  sendMessage: QRL<(content: string | MultimodalContent) => Promise<void>>
  append: QRL<
    (message: ModelMessage | UIMessage<TTools, TData>) => Promise<void>
  >
  addToolResult: QRL<
    (result: {
      toolCallId: string
      tool: string
      output: any
      state?: 'output-available' | 'output-error'
      errorText?: string
    }) => Promise<void>
  >
  addToolApprovalResponse: QRL<
    (response: { id: string; approved: boolean }) => Promise<void>
  >
  reload: QRL<() => Promise<void>>
  stop: QRL<() => void>
  isLoading: Signal<boolean>
  error: Signal<Error | undefined>
  setMessages: QRL<(messages: Array<UIMessage<TTools, TData>>) => void>
  clear: QRL<() => void>
  status: Signal<ChatClientState>
  isSubscribed: Signal<boolean>
  connectionStatus: Signal<ConnectionStatus>
  sessionGenerating: Signal<boolean>
}
