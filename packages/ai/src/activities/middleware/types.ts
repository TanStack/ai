import type { TokenUsage } from '../../types'

export type GenerationActivity =
  | 'chat'
  | 'image'
  | 'video'
  | 'audio'
  | 'tts'
  | 'transcription'
  | 'embedding'
  | 'rerank'
  | 'summarize'

export interface GenerationMiddlewareContext<TContext = unknown> {
  requestId: string
  /** Which activity this call is. Discriminates media from chat. */
  activity: GenerationActivity
  /** Provider/adapter name (e.g. `"openai"`). Emitted as `gen_ai.system`. */
  provider: string
  /** Model id. Emitted as `gen_ai.request.model`. */
  model: string
  /** Stable conversation/thread id, when supplied by the caller. */
  threadId?: string
  /** Stable run id, when supplied by the caller. */
  runId?: string
  modelOptions?: unknown
  /** Where the call originates. Always `'server'` for media activities. */
  source: 'client' | 'server'
  /** Generate a unique id with the given prefix. */
  createId: (prefix: string) => string
  /** Runtime context provided by the activity options, if any. */
  context: TContext
  resultTransforms: Array<GenerationResultTransform<any, TContext>>
  artifactInputs?: unknown
}

/** Stable context handed to each {@link GenerationResultTransform}. */
export interface GenerationResultTransformContext<TContext = unknown> {
  /** The activity call being transformed. */
  middleware: GenerationMiddlewareContext<TContext>
}

export type GenerationResultTransform<TResult = unknown, TContext = unknown> = (
  result: TResult,
  ctx: GenerationResultTransformContext<TContext>,
) => TResult | undefined | Promise<TResult | undefined>

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
