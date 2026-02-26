import type { StreamChunk } from '../../../types'
import type {
  AbortInfo,
  AfterToolCallInfo,
  BeforeToolCallDecision,
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ErrorInfo,
  FinishInfo,
  ToolCallHookContext,
  UsageInfo,
} from './types'

/**
 * Internal middleware runner that manages composed execution of middleware hooks.
 * Created once per chat() invocation.
 */
export class MiddlewareRunner {
  private readonly middlewares: ReadonlyArray<ChatMiddleware>

  constructor(middlewares: ReadonlyArray<ChatMiddleware>) {
    this.middlewares = middlewares
  }

  get hasMiddleware(): boolean {
    return this.middlewares.length > 0
  }

  /**
   * Pipe config through all middleware onConfig hooks in order.
   * Each middleware receives the merged config from previous middleware.
   * Partial returns are shallow-merged with the current config.
   */
  async runOnConfig(
    ctx: ChatMiddlewareContext,
    config: ChatMiddlewareConfig,
  ): Promise<ChatMiddlewareConfig> {
    let current = config
    for (const mw of this.middlewares) {
      if (mw.onConfig) {
        const result = await mw.onConfig(ctx, current)
        if (result !== undefined && result !== null) {
          current = { ...current, ...result }
        }
      }
    }
    return current
  }

  /**
   * Call onStart on all middleware in order.
   */
  async runOnStart(ctx: ChatMiddlewareContext): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onStart) {
        await mw.onStart(ctx)
      }
    }
  }

  /**
   * Pipe a single chunk through all middleware onChunk hooks in order.
   * Returns the resulting chunks (0..N) to yield to the consumer.
   *
   * - void: pass through unchanged
   * - chunk: replace with this chunk
   * - chunk[]: expand to multiple chunks
   * - null: drop the chunk entirely
   */
  async runOnChunk(
    ctx: ChatMiddlewareContext,
    chunk: StreamChunk,
  ): Promise<Array<StreamChunk>> {
    let chunks: Array<StreamChunk> = [chunk]

    for (const mw of this.middlewares) {
      if (!mw.onChunk) continue

      const nextChunks: Array<StreamChunk> = []
      for (const c of chunks) {
        const result = await mw.onChunk(ctx, c)
        if (result === null) {
          // Drop this chunk
          continue
        } else if (result === undefined) {
          // Pass through
          nextChunks.push(c)
        } else if (Array.isArray(result)) {
          // Expand
          nextChunks.push(...result)
        } else {
          // Replace
          nextChunks.push(result)
        }
      }
      chunks = nextChunks
    }

    return chunks
  }

  /**
   * Run onBeforeToolCall through middleware in order.
   * Returns the first non-void decision, or undefined to continue normally.
   */
  async runOnBeforeToolCall(
    ctx: ChatMiddlewareContext,
    hookCtx: ToolCallHookContext,
  ): Promise<BeforeToolCallDecision> {
    for (const mw of this.middlewares) {
      if (mw.onBeforeToolCall) {
        const decision = await mw.onBeforeToolCall(ctx, hookCtx)
        if (decision !== undefined && decision !== null) {
          return decision
        }
      }
    }
    return undefined
  }

  /**
   * Run onAfterToolCall on all middleware in order.
   */
  async runOnAfterToolCall(
    ctx: ChatMiddlewareContext,
    info: AfterToolCallInfo,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onAfterToolCall) {
        await mw.onAfterToolCall(ctx, info)
      }
    }
  }

  /**
   * Run onUsage on all middleware in order.
   */
  async runOnUsage(
    ctx: ChatMiddlewareContext,
    usage: UsageInfo,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onUsage) {
        await mw.onUsage(ctx, usage)
      }
    }
  }

  /**
   * Run onFinish on all middleware in order.
   */
  async runOnFinish(
    ctx: ChatMiddlewareContext,
    info: FinishInfo,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onFinish) {
        await mw.onFinish(ctx, info)
      }
    }
  }

  /**
   * Run onAbort on all middleware in order.
   */
  async runOnAbort(ctx: ChatMiddlewareContext, info: AbortInfo): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onAbort) {
        await mw.onAbort(ctx, info)
      }
    }
  }

  /**
   * Run onError on all middleware in order.
   */
  async runOnError(ctx: ChatMiddlewareContext, info: ErrorInfo): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onError) {
        await mw.onError(ctx, info)
      }
    }
  }
}
