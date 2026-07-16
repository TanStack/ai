// packages/ai-client/src/assistant-types.ts
import type {
  AudioGenerationResult,
  ImageGenerationResult,
  InferChatSchema,
  InferChatTools,
  SummarizationResult,
  TTSResult,
  TranscriptionResult,
  VideoJobResult,
} from '@tanstack/ai'
import type { AssistantDefinition } from '@tanstack/ai/assistant'
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
  AudioGenerateInput,
  GenerationClientOptions,
  GenerationClientState,
  ImageGenerateInput,
  InferGenerationOutput,
  SpeechGenerateInput,
  SummarizeGenerateInput,
  TranscriptionGenerateInput,
  VideoGenerateInput,
} from './generation-types.js'

/**
 * Reactive state callbacks forwarded into the underlying sub-clients.
 *
 * `ChatClient` and `GenerationClient` only accept these callbacks via their
 * constructors (`updateOptions` does not accept them), so `AssistantClient`
 * must thread them through at construction time rather than attaching them
 * post-construction.
 */
export interface AssistantClientCallbacks {
  /** Reactive state callbacks forwarded to the `ChatClient` constructor. */
  chat?: Pick<
    ChatClientOptions,
    | 'onMessagesChange'
    | 'onLoadingChange'
    | 'onErrorChange'
    | 'onStatusChange'
    | 'onSubscriptionChange'
    | 'onConnectionStatusChange'
    | 'onSessionGeneratingChange'
  >
  /**
   * Reactive state callbacks forwarded to a one-shot capability's
   * `GenerationClient` constructor. Invoked once per declared one-shot
   * capability so each sub-client can be wired independently.
   */
  oneShot?: (
    capability: OneShotCapabilityName,
  ) => Pick<
    GenerationClientOptions<any, any, any>,
    'onResultChange' | 'onLoadingChange' | 'onErrorChange' | 'onStatusChange'
  >
}

/**
 * Per-one-shot-capability options. Mirrors the standalone generation hooks:
 * an optional `onResult` transform (its return type becomes the capability's
 * `result` type) plus extra `forwardedProps` merged into the request body.
 */
export interface OneShotCapabilityOptions<TResult> {
  /**
   * Transform the raw backend result before it is stored on the surface.
   * `assistant.<capability>.result` becomes this function's (non-nullish)
   * return type. Return `undefined`/`null`/`void` to keep the raw result.
   */
  onResult?: (result: TResult) => unknown
  /** Extra fields merged into this capability's request body. */
  forwardedProps?: Record<string, any>
}

/** Options for AssistantClient (framework-agnostic core). */
export interface AssistantClientOptions<
  TDef extends AssistantDefinition<any>,
  /**
   * @deprecated Chat tool typing is now inferred from the assistant
   * definition's chat callback (`TDef`), not from this generic. Retained only
   * so the framework hooks (`ai-react`/`ai-solid`/`ai-vue`/`ai-svelte`), which
   * still thread it through, keep compiling until they are updated. It no
   * longer influences the chat surface's message/tool types.
   */
  TChatTools extends ReadonlyArray<AnyClientTool> = [],
> {
  assistant: TDef
  connection: ConnectConnectionAdapter
  id?: string
  threadId?: string
  /** Chat-only options mirrored onto the underlying ChatClient. */
  chat?: {
    tools?: TChatTools
    forwardedProps?: Record<string, any>
  }
  /** Per-capability one-shot options (`onResult` transform, forwardedProps). */
  image?: OneShotCapabilityOptions<ImageGenerationResult>
  audio?: OneShotCapabilityOptions<AudioGenerationResult>
  speech?: OneShotCapabilityOptions<TTSResult>
  video?: OneShotCapabilityOptions<VideoJobResult>
  transcription?: OneShotCapabilityOptions<TranscriptionResult>
  summarize?: OneShotCapabilityOptions<SummarizationResult>
  /**
   * Reactive state callbacks forwarded into the sub-clients' constructors.
   * Set by framework hooks (not users) to wire up reactive state.
   */
  callbacks?: AssistantClientCallbacks
}

/** Maps declared capability names to their client generate-input type. */
export interface GenerateInputByCapability {
  image: ImageGenerateInput
  audio: AudioGenerateInput
  speech: SpeechGenerateInput
  video: VideoGenerateInput
  transcription: TranscriptionGenerateInput
  summarize: SummarizeGenerateInput
}

/** Maps declared capability names to their result type. */
export interface ResultByCapability {
  image: ImageGenerationResult
  audio: AudioGenerationResult
  speech: TTSResult
  video: VideoJobResult
  transcription: TranscriptionResult
  summarize: SummarizationResult
}

export type OneShotCapabilityName = keyof GenerateInputByCapability

/**
 * Recursive partial — every property and every nested array element is
 * optional. Types the in-flight `partial` value the chat surface exposes while
 * a structured-output stream is still arriving (the JSON has shape but is
 * incomplete). Mirrors the `DeepPartial` used by the framework `useChat`
 * hooks.
 */
export type DeepPartial<T> =
  T extends ReadonlyArray<infer TItem>
    ? Array<DeepPartial<TItem>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T

/**
 * Map a captured chat-callback tool (server / definition / client) to a
 * `definition`-shaped object so it satisfies the `AnyClientTool` constraint on
 * `UIMessage`/`ToolCallPart` **without** relaxing the core message types.
 *
 * The chat callback's `tools` are typically server (`.server()`) or bare
 * definition tools, whose `__toolSide` is `'server'` / `'definition'` —
 * `AnyClientTool` rejects `'server'`. We rebuild each tool as a
 * `'definition'`-side object, preserving the exact fields the `Infer*` helpers
 * and `ToolCallPartForTool` read (`name`, `inputSchema`, `outputSchema`,
 * `needsApproval`). `description` is required by `AnyClientTool`'s underlying
 * `Tool` shape, so it is kept as `string` (its value never feeds message
 * typing).
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

/** Recover the chat callback's return type from an assistant definition. */
type ChatCallbackReturn<TDef> =
  TDef extends AssistantDefinition<infer TCaps>
    ? TCaps extends { chat: (...args: Array<any>) => infer TRet }
      ? TRet
      : never
    : never

/**
 * Client-tool-shaped tuple recovered from the chat callback's captured tools.
 * Drives the `messages` tool-call/result part typing on the chat surface.
 */
export type ChatToolsOf<TDef> = ToClientTools<
  NonNullable<InferChatTools<ChatCallbackReturn<TDef>>>
>

/** Structured-output schema recovered from the chat callback (or `undefined`). */
export type ChatSchemaOf<TDef> = InferChatSchema<ChatCallbackReturn<TDef>>

/** The base chat capability surface — mirrors the frameworks' useChat return. */
export interface AssistantChatSurfaceBase<
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
 * The chat capability surface. Extends {@link AssistantChatSurfaceBase} and,
 * when the chat callback declared an `outputSchema` (`TSchema extends
 * SchemaInput`), adds the typed structured-output fields `partial` / `final`
 * — mirroring the framework `useChat` hooks' conditional return. When no
 * schema was declared, neither field is present.
 */
export type AssistantChatSurface<
  TTools extends ReadonlyArray<AnyClientTool> = [],
  TSchema = undefined,
> = AssistantChatSurfaceBase<TTools> & {
  /**
   * Send a message and get a response. Can be a simple string or multimodal
   * content with images, audio, etc.
   *
   * Resolves once the assistant turn completes: to the schema-validated final
   * structured output (`InferSchemaType<TSchema> | null`) when the chat
   * callback declared an `outputSchema`, otherwise to the resulting messages
   * array (`Array<UIMessage<TTools>>`).
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
         * Final, schema-validated structured output. `null` until the terminal
         * structured-output event arrives. Resets on every new run.
         */
        final: InferSchemaType<TSchema> | null
      }
    : Record<never, never>)

/** The one-shot capability surface — mirrors useGeneration return. */
export interface AssistantGenerationSurface<TInput, TResult> {
  generate: (input: TInput) => Promise<TResult | null>
  result: TResult | null
  isLoading: boolean
  error: Error | undefined
  status: GenerationClientState
  stop: () => void
  reset: () => void
}

/**
 * The full typed system returned by useAssistant.
 *
 * The `chat` surface is fully inferred from the assistant definition's chat
 * callback — its captured tools type `chat.messages`' tool-call/result parts,
 * and its `outputSchema` (if any) adds typed `chat.partial` / `chat.final`.
 */
/**
 * The stored `result` type for a one-shot capability `K`: the `onResult`
 * transform's return type when the options declare one (via
 * {@link InferGenerationOutput}), otherwise the raw backend result.
 */
export type OneShotResultType<
  TOptions,
  TCap extends OneShotCapabilityName,
> = TCap extends keyof TOptions
  ? TOptions[TCap] extends { onResult?: infer TFn }
    ? InferGenerationOutput<ResultByCapability[TCap], TFn>
    : ResultByCapability[TCap]
  : ResultByCapability[TCap]

export type AssistantSystem<
  TDef extends AssistantDefinition<any>,
  /**
   * @deprecated No longer used for chat tool typing — chat tools are inferred
   * from `TDef`'s chat callback. Retained so the framework hooks that still
   * pass a second generic keep compiling; it has no effect on the surface.
   */
  TChatTools extends ReadonlyArray<AnyClientTool> = [],
  /**
   * The user's options object. Its per-capability `onResult` transforms drive
   * each one-shot capability's `result` type. Defaults to `unknown` (no
   * transforms → raw backend result types).
   */
  TOptions = unknown,
> =
  // `TChatTools` is deprecated/unused for typing; the constraint always holds,
  // so this reads the parameter (keeping it for hook back-compat) without
  // affecting the resulting surface.
  [TChatTools] extends [ReadonlyArray<AnyClientTool>]
    ? {
        [K in keyof TDef['~caps'] & string]: K extends 'chat'
          ? AssistantChatSurface<ChatToolsOf<TDef>, ChatSchemaOf<TDef>>
          : K extends OneShotCapabilityName
            ? AssistantGenerationSurface<
                GenerateInputByCapability[K],
                OneShotResultType<TOptions, K>
              >
            : never
      }
    : never
