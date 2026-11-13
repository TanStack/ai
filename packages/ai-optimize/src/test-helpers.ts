import type { ChatMiddleware, ChatMiddlewareConfig, ChatMiddlewareContext, ModelMessage, Tool } from '@tanstack/ai'

/** Throw if a value that tests expect to be present is missing — avoids `!`. */
export function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('expected a non-nullish value')
  return value
}

/** Typed array access without a non-null assertion. */
export function at<T>(arr: ReadonlyArray<T>, index: number): T {
  return must(arr[index])
}

/** A minimal middleware context stub. `onConfig` only reads `ctx.phase`. */
export function stubCtx(phase = 'beforeModel'): ChatMiddlewareContext {
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- test stub: onConfig reads only ctx.phase
  return { phase } as unknown as ChatMiddlewareContext
}

export function stubConfig(
  messages: Array<ModelMessage>,
  tools: Array<Tool>,
  extra: Partial<ChatMiddlewareConfig> = {},
): ChatMiddlewareConfig {
  // oxlint-disable-next-line eslint-js/no-restricted-syntax -- test stub: only the fields onConfig reads
  return { messages, tools, systemPrompts: [], ...extra } as unknown as ChatMiddlewareConfig
}

export type Projected = { providerMessages: Array<ModelMessage> } | undefined

/** Run a middleware's `onConfig` and return its (synchronous) projection. */
export function runConfig(mw: ChatMiddleware, ctx: ChatMiddlewareContext, cfg: ChatMiddlewareConfig): Projected {
  const onConfig = must(mw.onConfig)
  return onConfig(ctx, cfg) as Projected
}

/** Execute a tool's `execute` without a non-null assertion. */
export async function callTool(tool: { execute?: (args: unknown, context?: never) => unknown }, args: unknown): Promise<unknown> {
  const execute = must(tool.execute)
  return execute(args)
}
