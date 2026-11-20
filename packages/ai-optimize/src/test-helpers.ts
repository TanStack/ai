import { CapabilityRegistry } from '@tanstack/ai'
import type {
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ModelMessage,
  Tool,
  ToolExecutionContext,
} from '@tanstack/ai'

/** Throw if a value that tests expect to be present is missing — avoids `!`. */
export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('expected a non-nullish value')
  return value
}

/** Typed array access without a non-null assertion. */
export function at<T>(arr: ReadonlyArray<T>, index: number): T {
  return must(arr[index])
}

/** A minimal middleware context stub: one stub = one run. The middleware reads
 *  `ctx.phase`, and keeps its run state in a capability, so the stub carries a
 *  capability registry. */
export function stubCtx(phase = 'beforeModel'): ChatMiddlewareContext {
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- test stub: only the fields the middleware reads
  return {
    phase,
    capabilities: new CapabilityRegistry(),
  } as unknown as ChatMiddlewareContext
}

// chat() runs `setup` once per run, before any `onConfig`. Mirror that.
const setUp = new WeakMap<ChatMiddleware, WeakSet<ChatMiddlewareContext>>()
function ensureSetup(mw: ChatMiddleware, ctx: ChatMiddlewareContext): void {
  const done = setUp.get(mw) ?? new WeakSet<ChatMiddlewareContext>()
  setUp.set(mw, done)
  if (done.has(ctx)) return
  done.add(ctx)
  void mw.setup?.(ctx)
}

export function stubConfig(
  messages: Array<ModelMessage>,
  tools: Array<Tool>,
  extra: Partial<ChatMiddlewareConfig> = {},
): ChatMiddlewareConfig {
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- test stub: only the fields onConfig reads
  return {
    messages,
    tools,
    systemPrompts: [],
    ...extra,
  } as unknown as ChatMiddlewareConfig
}

export type Projected = { providerMessages: Array<ModelMessage> } | undefined

/** Run a middleware's `onConfig` and return its (synchronous) projection. */
export function runConfig(
  mw: ChatMiddleware,
  ctx: ChatMiddlewareContext,
  cfg: ChatMiddlewareConfig,
): Projected {
  ensureSetup(mw, ctx)
  const onConfig = must(mw.onConfig)
  return onConfig(ctx, cfg) as Projected
}

/** Execute a tool's `execute` without a non-null assertion. With `ctx`, the
 *  tool reads capabilities of that run, as it does inside chat(). */
export async function callTool(
  tool: { execute?: (args: unknown, context?: never) => unknown },
  args: unknown,
  ctx?: ChatMiddlewareContext,
): Promise<unknown> {
  const execute = must(tool.execute)
  if (!ctx) return execute(args)
  const context: Pick<ToolExecutionContext, 'getOptional'> = {
    getOptional: ([get]) => get(ctx, { optional: true }),
  }
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- test stub: execute's context param is typed never here
  return execute(args, context as never)
}
