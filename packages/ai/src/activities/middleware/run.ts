import type {
  GenerationAbortInfo,
  GenerationErrorInfo,
  GenerationFinishInfo,
  GenerationMiddleware,
  GenerationMiddlewareContext,
  GenerationResultTransformContext,
  GenerationUsageInfo,
} from './types'

/**
 * Build the stable context for a single media-activity call.
 *
 * Media activities are always server-side and carry no user runtime context,
 * so `source` is fixed to `'server'` and `context` to `undefined`.
 */
export function createGenerationContext(args: {
  requestId: string
  activity: GenerationMiddlewareContext['activity']
  provider: string
  model: string
  modelOptions?: unknown
  threadId?: string
  runId?: string
  artifactInputs?: unknown
  createId: (prefix: string) => string
}): GenerationMiddlewareContext {
  return {
    requestId: args.requestId,
    activity: args.activity,
    provider: args.provider,
    model: args.model,
    modelOptions: args.modelOptions,
    threadId: args.threadId,
    runId: args.runId,
    source: 'server',
    createId: args.createId,
    context: undefined,
    resultTransforms: [],
    artifactInputs: args.artifactInputs,
  }
}

/**
 * Run a single lifecycle hook across each middleware in registration order,
 * awaiting each. Exceptions PROPAGATE (matching `chat()` middleware) — a
 * broken middleware fails the activity rather than being silently swallowed.
 */
async function run(
  middleware: ReadonlyArray<GenerationMiddleware> | undefined,
  invoke: (mw: GenerationMiddleware) => void | Promise<void>,
): Promise<void> {
  if (!middleware || middleware.length === 0) return
  for (const mw of middleware) {
    await invoke(mw)
  }
}

export function runGenerationStart(
  middleware: ReadonlyArray<GenerationMiddleware> | undefined,
  ctx: GenerationMiddlewareContext,
): Promise<void> {
  return run(middleware, (mw) => mw.onStart?.(ctx))
}

export function runGenerationUsage(
  middleware: ReadonlyArray<GenerationMiddleware> | undefined,
  ctx: GenerationMiddlewareContext,
  usage: GenerationUsageInfo,
): Promise<void> {
  return run(middleware, (mw) => mw.onUsage?.(ctx, usage))
}

export function runGenerationFinish(
  middleware: ReadonlyArray<GenerationMiddleware> | undefined,
  ctx: GenerationMiddlewareContext,
  info: GenerationFinishInfo,
): Promise<void> {
  return run(middleware, (mw) => mw.onFinish?.(ctx, info))
}

export function runGenerationAbort(
  middleware: ReadonlyArray<GenerationMiddleware> | undefined,
  ctx: GenerationMiddlewareContext,
  info: GenerationAbortInfo,
): Promise<void> {
  return run(middleware, (mw) => mw.onAbort?.(ctx, info))
}

export function runGenerationError(
  middleware: ReadonlyArray<GenerationMiddleware> | undefined,
  ctx: GenerationMiddlewareContext,
  info: GenerationErrorInfo,
): Promise<void> {
  return run(middleware, (mw) => mw.onError?.(ctx, info))
}

export async function applyGenerationResultTransforms<TResult>(
  ctx: GenerationMiddlewareContext,
  result: TResult,
): Promise<TResult> {
  let current = result
  const transformCtx: GenerationResultTransformContext = { middleware: ctx }

  for (const transform of ctx.resultTransforms ?? []) {
    const transformed = await transform(current, transformCtx)
    if (transformed !== undefined) {
      current = transformed as TResult
    }
  }

  return current
}
