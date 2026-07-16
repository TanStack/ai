// packages/ai-plugin-toolkit/src/types.ts
import type { Context as AGUIContext, RunAgentInput } from '@ag-ui/core'
import type {
  ChatStream,
  InferSchemaType,
  JSONSchema,
  ModelMessage,
  SchemaInput,
  StreamChunk,
  StructuredOutputStream,
  UIMessage,
} from '@tanstack/ai'

/**
 * An already-parsed AG-UI request body — the shape
 * `chatParamsFromRequestBody` accepts. Passed to `.run(body)` when the caller
 * has the parsed envelope but no HTTP `Request`.
 */
export type PluginRequestBody = RunAgentInput

/**
 * Envelope overrides for a direct `.run(rawInput, options)` call. Every field
 * is optional; absent fields fall back to synthetic defaults (`crypto.randomUUID()`
 * ids, `state: null`, empty `aguiContext`/`forwardedProps`, a synthetic `Request`).
 */
export interface PluginRunOptions {
  /** A real `Request` to expose to the plugin (headers, auth, abort signal). */
  request?: Request
  threadId?: string
  runId?: string
  parentRunId?: string
  signal?: AbortSignal
  state?: unknown
  aguiContext?: Array<AGUIContext>
  forwardedProps?: Record<string, unknown>
}

/** The collected result of running a chat plugin directly (no streaming). */
export interface CollectedChatResult<TStructured = unknown> {
  /** The accumulated assistant text (concatenated `TEXT_MESSAGE_CONTENT` deltas). */
  text: string
  /** The terminal structured output, or `null` when the run produced none. */
  structured: TStructured | null
}

/** The parsed request handed to a chat plugin's callback. */
export interface ChatPluginRequest {
  messages: Array<UIMessage | ModelMessage>
  threadId: string
  runId: string
  parentRunId?: string
  /** Client-declared tools (name/description/JSON-schema) from the AG-UI body. */
  tools: Array<{ name: string; description: string; parameters: JSONSchema }>
  forwardedProps: Record<string, unknown>
  state: unknown
  aguiContext: Array<AGUIContext>
  /** Raw request, for escape hatches (headers, auth). */
  request: Request
}

/**
 * The return types a chat plugin callback may produce. The promise forms are
 * accepted for assignability with `chat()`'s overloads but rejected at
 * request time — a chat plugin must stream.
 */
export type ChatPluginReturn =
  | ChatStream
  | StructuredOutputStream<any>
  | Promise<string>
  | Promise<object>

/**
 * The callback shape a chat plugin wraps: full conversational turns —
 * message history in, a streaming chat (or structured-output) stream out.
 */
export type ChatPluginCallback = (req: ChatPluginRequest) => ChatPluginReturn

/**
 * A conversational plugin. Produces the full chat surface on the client
 * (`sendMessage` / `messages` / tools / approvals). Create with
 * {@link chatPlugin}; the callback generic is preserved so the client can
 * infer tool and output-schema types from its return type.
 */
export interface ChatPlugin<
  TCallback extends ChatPluginCallback = ChatPluginCallback,
> {
  readonly kind: 'chat'
  readonly callback: TCallback
  /**
   * Run this chat plugin directly, in-process (no HTTP). Collects the callback's
   * stream into `{ text, structured }`. Accepts raw messages (+ envelope
   * `options`), an HTTP `Request`, or an already-parsed AG-UI body.
   */
  run: ((
    messages: Array<UIMessage | ModelMessage>,
    options?: PluginRunOptions,
  ) => Promise<CollectedChatResult<StructuredOutputOf<TCallback>>>) & ((
    request: Request,
  ) => Promise<CollectedChatResult<StructuredOutputOf<TCallback>>>) & ((
    body: PluginRequestBody,
  ) => Promise<CollectedChatResult<StructuredOutputOf<TCallback>>>)
}

/**
 * The structured-output type a chat callback yields, when it returns a
 * {@link StructuredOutputStream}; otherwise `unknown`.
 */
export type StructuredOutputOf<TCallback extends ChatPluginCallback> =
  ReturnType<TCallback> extends StructuredOutputStream<infer T> ? T : unknown

/** The parsed request handed to a one-shot plugin's `execute`. */
export interface GenerationPluginRequest<TInput = unknown> {
  /**
   * The client-sent input. Validated against the plugin's `input` schema
   * (when one is declared) before `execute` runs.
   */
  input: TInput
  threadId: string
  runId: string
  parentRunId?: string
  state: unknown
  aguiContext: Array<AGUIContext>
  /** The raw forwarded props, including fields outside the input schema. */
  forwardedProps: Record<string, unknown>
  /** Raw request, for escape hatches (headers, auth). */
  request: Request
  /**
   * Aborted when the client disconnects or stops the run. Pass into
   * activities (e.g. `chat({ abortSignal })`) to cancel provider work.
   */
  signal: AbortSignal
}

/** The `execute` shape of a one-shot plugin. */
export type GenerationPluginExecute<TInput, TResult> = (
  req: GenerationPluginRequest<TInput>,
) => Promise<TResult> | AsyncIterable<StreamChunk>

/**
 * A one-shot plugin: validated input in, result out. Create with
 * {@link generationPlugin}; the input/result generics are preserved so the
 * client can type `plugin.<name>.run(input)` end to end.
 */
export interface GenerationPlugin<TInput = unknown, TResult = unknown> {
  readonly kind: 'one-shot'
  /** Optional Standard Schema for the input; validated before `execute`. */
  readonly input?: SchemaInput
  readonly execute: GenerationPluginExecute<TInput, TResult>
  /**
   * Run this one-shot plugin directly, in-process (no HTTP). Validates the input
   * against the plugin's schema (when declared), runs `execute`, and returns the
   * result — draining the terminal `generation:result` when `execute` streams.
   * Accepts raw input (+ envelope `options`), an HTTP `Request`, or an
   * already-parsed AG-UI body.
   */
  run: ((input: TInput, options?: PluginRunOptions) => Promise<TResult>) & ((request: Request) => Promise<TResult>) & ((body: PluginRequestBody) => Promise<TResult>)
}

/** The options accepted by {@link generationPlugin}. */
export interface GenerationPluginOptions<
  TSchema extends SchemaInput | undefined,
  TResult,
> {
  /**
   * Standard Schema (Zod, ArkType, Valibot, ...) describing the input.
   * Validated at runtime before `execute`; drives the client-side input type.
   */
  input?: TSchema
  execute: GenerationPluginExecute<
    TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown,
    TResult
  >
}

export type AnyPlugin = ChatPlugin<any> | GenerationPlugin<any, any>

/** The shape a user passes to `definePlugin`: app-named plugins. */
export type PluginConfig = Record<string, AnyPlugin>

export type PluginKind = AnyPlugin['kind']

export interface PluginDefinition<T extends PluginConfig = PluginConfig> {
  /** The declared plugin names (for the client to enumerate). */
  readonly plugins: ReadonlyArray<keyof T & string>
  /** Each plugin's kind, so the client composer picks the right sub-client. */
  readonly pluginKinds: Readonly<Record<string, PluginKind>>
  /** Single request handler; routes by the `plugin` discriminator. */
  handler: (request: Request) => Promise<Response>
  /** Type-only carrier of the config for client inference. Never read at runtime. */
  readonly '~plugins': T
}
