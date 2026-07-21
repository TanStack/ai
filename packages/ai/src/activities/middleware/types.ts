import type { TokenUsage } from '../../types'

// ===========================
// Generation middleware
// ===========================
//
// The base, activity-agnostic middleware contract. Every activity — chat and
// the media activities — runs middleware that satisfies this shape. `chat()`
// accepts the richer `ChatMiddleware` superset (it adds config/chunk/tool
// hooks and capability primitives on top of these lifecycle hooks); media
// activities accept `GenerationMiddleware` directly.
//
// The relationship is intentionally STRUCTURAL, not nominal: `ChatMiddleware`
// does not `extends GenerationMiddleware`. Chat hooks use function-property
// syntax, so under `strictFunctionTypes` a narrowed-context subtype would be
// rejected; declaring it via inheritance would force method syntax and reopen
// a bivariance hole (a chat hook reading `ctx.messages` slotted where only a
// base context exists). Instead, the base context/info types are SUPERTYPES
// (fewer fields) and the chat context/info types are SUBTYPES (more fields),
// so a single value whose lifecycle hooks are authored against the base — like
// `otelMiddleware()` — satisfies `GenerationMiddleware & ChatMiddleware` by
// contravariance, while an arbitrary `ChatMiddleware` is NOT assignable to
// `GenerationMiddleware`.

/**
 * The activity an observability event describes.
 *
 * Mirrors the public surface a caller reaches for: `'chat'` for `chat()`, and
 * the media kinds for the `generate*` activities. `'tts'` matches the speech
 * adapter's kind (the public discriminator avoids inventing a parallel
 * `'speech'`/`'text'` vocabulary). `otelMiddleware` maps each to its
 * `gen_ai.operation.name`.
 */
export type GenerationActivity =
  | 'chat'
  | 'image'
  | 'video'
  | 'audio'
  | 'tts'
  | 'transcription'

/**
 * Stable context passed to every {@link GenerationMiddleware} hook. Created
 * once per activity call and shared across the hooks of that call.
 *
 * Carries only fields every activity can honor. `ChatMiddlewareContext`
 * structurally includes all of these plus chat-only state (messages,
 * iteration, capabilities, …), which is why a chat middleware that reads those
 * extra fields is not assignable to `GenerationMiddleware`.
 */
export interface GenerationMiddlewareContext<TContext = unknown> {
  /**
   * Stable id correlating the `onStart` / `onFinish` / `onError` / `onAbort`
   * hooks of a single activity call.
   */
  requestId: string
  /** Which activity this call is. Discriminates media from chat. */
  activity: GenerationActivity
  /** Provider/adapter name (e.g. `"openai"`). Emitted as `gen_ai.system`. */
  provider: string
  /** Model id. Emitted as `gen_ai.request.model`. */
  model: string
  /**
   * Provider-specific options passed to the activity, if any. Typed `unknown`
   * because each activity's options are strongly typed per model; a supertype
   * of `ChatMiddlewareContext`'s `modelOptions`.
   */
  modelOptions?: unknown
  /** Where the call originates. Always `'server'` for media activities. */
  source: 'client' | 'server'
  /** Generate a unique id with the given prefix. */
  createId: (prefix: string) => string
  /** Runtime context provided by the activity options, if any. */
  context: TContext
}

// ===========================
// Hook payloads
// ===========================

/**
 * Token usage passed to {@link GenerationMiddleware.onUsage}. Kept as an
 * interface extending `TokenUsage` to preserve declaration merging for this
 * publicly exported type.
 */
export interface GenerationUsageInfo extends TokenUsage {}

/** Information passed to {@link GenerationMiddleware.onFinish}. */
export interface GenerationFinishInfo {
  /** Wall-clock duration of the activity call, in milliseconds. */
  duration: number
  /** Unified usage, when the provider reported it. */
  usage?: TokenUsage | undefined
}

/** Information passed to {@link GenerationMiddleware.onAbort}. */
export interface GenerationAbortInfo {
  /** The reason for the abort, if provided. */
  reason?: string
  /** Wall-clock duration until the abort, in milliseconds. */
  duration: number
}

/** Information passed to {@link GenerationMiddleware.onError}. */
export interface GenerationErrorInfo {
  /** The thrown value (typically an `Error`). */
  error: unknown
  /** Wall-clock duration until the failure, in milliseconds. */
  duration: number
}

// ===========================
// Middleware interface
// ===========================

/**
 * Activity-agnostic, observe-only middleware.
 *
 * A thin lifecycle observer registerable on any activity via its `middleware`
 * option. Unlike `ChatMiddleware` (which can also rewrite config, chunks, and
 * tool calls), these hooks only observe — the right fit for the single
 * request → response shape of media activities. Pass `otelMiddleware()` for
 * OpenTelemetry, or implement the hooks directly for a custom backend.
 *
 * Hooks are awaited in registration order. A hook that throws PROPAGATES and
 * fails the activity — matching `chat()` middleware semantics. Keep them cheap;
 * they run inline with the request.
 *
 * Exactly one of `onFinish` / `onAbort` / `onError` fires per call.
 *
 * @example
 * ```ts
 * import { generateImage } from '@tanstack/ai'
 * import { otelMiddleware } from '@tanstack/ai/middlewares/otel'
 * import { openaiImage } from '@tanstack/ai-openai'
 * import { trace } from '@opentelemetry/api'
 *
 * await generateImage({
 *   adapter: openaiImage('gpt-image-1'),
 *   prompt: 'A serene mountain landscape at sunset',
 *   middleware: [otelMiddleware({ tracer: trace.getTracer('my-app') })],
 * })
 * ```
 */
export interface GenerationMiddleware<TContext = unknown> {
  /** Optional name, surfaced in diagnostics. */
  name?: string
  /** Called before the adapter request begins. */
  onStart?: (ctx: GenerationMiddlewareContext<TContext>) => void | Promise<void>
  /** Called when the provider reports usage, before `onFinish`. */
  onUsage?: (
    ctx: GenerationMiddlewareContext<TContext>,
    usage: GenerationUsageInfo,
  ) => void | Promise<void>
  /** Called after the activity completes successfully. */
  onFinish?: (
    ctx: GenerationMiddlewareContext<TContext>,
    info: GenerationFinishInfo,
  ) => void | Promise<void>
  /** Called when the activity is aborted (e.g. an abandoned stream). */
  onAbort?: (
    ctx: GenerationMiddlewareContext<TContext>,
    info: GenerationAbortInfo,
  ) => void | Promise<void>
  /** Called when the activity throws before completing. */
  onError?: (
    ctx: GenerationMiddlewareContext<TContext>,
    info: GenerationErrorInfo,
  ) => void | Promise<void>
}

/** A `GenerationMiddleware` with a permissive context — for use as a constraint. */
export type AnyGenerationMiddleware = GenerationMiddleware<any>
