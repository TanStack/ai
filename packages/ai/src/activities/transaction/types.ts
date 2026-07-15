// packages/ai/src/activities/transaction/types.ts
import type { Context as AGUIContext } from '@ag-ui/core'
import type {
  ChatStream,
  InferSchemaType,
  JSONSchema,
  ModelMessage,
  SchemaInput,
  StreamChunk,
  StructuredOutputStream,
  UIMessage,
} from '../../types.js'

/** The parsed request handed to a chat verb's callback. */
export interface TransactionChatRequest {
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
 * The return types a chat verb callback may produce. The promise forms are
 * accepted for assignability with `chat()`'s overloads but rejected at
 * request time — a chat verb must stream.
 */
export type ChatVerbReturn =
  | ChatStream
  | StructuredOutputStream<any>
  | Promise<string>
  | Promise<object>

/**
 * The callback shape a chat verb wraps: full conversational turns — message
 * history in, a streaming chat (or structured-output) stream out.
 */
export type ChatVerbCallback = (req: TransactionChatRequest) => ChatVerbReturn

/**
 * A conversational verb. Produces the full chat surface on the client
 * (`sendMessage` / `messages` / tools / approvals). Create with
 * {@link chatVerb}; the callback generic is preserved so the client can
 * infer tool and output-schema types from its return type.
 */
export interface ChatVerb<
  TCallback extends ChatVerbCallback = ChatVerbCallback,
> {
  readonly kind: 'chat'
  readonly callback: TCallback
}

/** The parsed request handed to a one-shot verb's `execute`. */
export interface VerbRequest<TInput = unknown> {
  /**
   * The client-sent input. Validated against the verb's `input` schema
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

/**
 * The result of running a chat verb to completion inside a transaction via
 * `ctx.call`: the accumulated assistant text plus the schema-validated
 * structured output (when the callback declared an `outputSchema`).
 */
export interface CollectedChatResult<TStructured = unknown> {
  text: string
  structured: TStructured | null
}

/**
 * Composition context handed to every one-shot verb's `execute`. `ctx.call`
 * invokes another verb as a tagged sub-run of the current transaction: its
 * stream is forwarded into the parent response (so the client can observe it
 * live) and the call resolves with the sub-verb's result.
 */
export interface TransactionRunContext {
  call: TransactionCall
  /** Aborted when the client disconnects or stops the run. */
  signal: AbortSignal
}

export interface TransactionCall {
  /** Run a one-shot verb as a sub-run; resolves with its result. */
  <TIn, TRes>(verb: OneShotVerb<TIn, TRes>, input: TIn): Promise<TRes>
  /**
   * Run a chat verb's callback to completion as a sub-run; resolves with the
   * accumulated text and (if the callback declared an `outputSchema`) the
   * validated structured output.
   */
  <TCallback extends ChatVerbCallback>(
    verb: ChatVerb<TCallback>,
    messages: Array<UIMessage | ModelMessage>,
  ): Promise<CollectedChatResult>
}

/** The `execute` shape of a one-shot verb. */
export type VerbExecute<TInput, TResult> = (
  req: VerbRequest<TInput>,
  ctx: TransactionRunContext,
) => Promise<TResult> | AsyncIterable<StreamChunk>

/**
 * A one-shot verb: validated input in, result out. Create with {@link verb};
 * the input/result generics are preserved so the client can type
 * `txn.<name>.run(input)` end to end.
 */
export interface OneShotVerb<TInput = unknown, TResult = unknown> {
  readonly kind: 'one-shot'
  /** Optional Standard Schema for the input; validated before `execute`. */
  readonly input?: SchemaInput
  readonly execute: VerbExecute<TInput, TResult>
}

/** The options accepted by {@link verb}. */
export interface VerbOptions<TSchema extends SchemaInput | undefined, TResult> {
  /**
   * Standard Schema (Zod, ArkType, Valibot, ...) describing the input.
   * Validated at runtime before `execute`; drives the client-side input type.
   */
  input?: TSchema
  execute: VerbExecute<
    TSchema extends SchemaInput ? InferSchemaType<TSchema> : unknown,
    TResult
  >
}

export type AnyVerb = ChatVerb<any> | OneShotVerb<any, any>

/** The shape a user passes to `defineTransaction`: app-named verbs. */
export type TransactionConfig = Record<string, AnyVerb>

export type VerbKind = AnyVerb['kind']

export interface TransactionDefinition<
  T extends TransactionConfig = TransactionConfig,
> {
  /** The declared verb names (for the client to enumerate). */
  readonly verbs: ReadonlyArray<keyof T & string>
  /** Each verb's kind, so the client composer picks the right sub-client. */
  readonly verbKinds: Readonly<Record<string, VerbKind>>
  /** Single request handler; routes by the `verb` discriminator. */
  handler: (request: Request) => Promise<Response>
  /** Type-only carrier of the config for client inference. Never read at runtime. */
  readonly '~verbs': T
}

/**
 * Verb-name → kind map required by {@link clientTransaction}. Every declared
 * verb must appear exactly once with its correct kind so client/server drift
 * fails at compile time.
 */
export type ClientTransactionKinds<TDef extends TransactionDefinition<any>> = {
  [K in keyof TDef['~verbs'] & string]: TDef['~verbs'][K]['kind']
}

/** Payloads of the CUSTOM events a transaction run emits for its sub-runs. */
export interface SubRunStartedPayload {
  runId: string
  parentRunId: string
  verb: string
  index: number
}
export interface SubRunChunkPayload extends SubRunStartedPayload {
  chunk: unknown
}
export interface SubRunResultPayload extends SubRunStartedPayload {
  result: unknown
}
export interface SubRunErrorPayload extends SubRunStartedPayload {
  message: string
}

/** CUSTOM event names used by the transaction sub-run protocol. */
export const TRANSACTION_EVENTS = {
  SUB_RUN_STARTED: 'transaction:sub-run:started',
  SUB_RUN_CHUNK: 'transaction:sub-run:chunk',
  SUB_RUN_RESULT: 'transaction:sub-run:result',
  SUB_RUN_ERROR: 'transaction:sub-run:error',
} as const
