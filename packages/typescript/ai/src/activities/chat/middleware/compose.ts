import { aiEventClient } from '@tanstack/ai-event-client'
import type { StreamChunk } from '../../../types'
import type { InternalLogger } from '../../../logger/internal-logger'
import type {
  AbortInfo,
  AfterToolCallInfo,
  BeforeToolCallDecision,
  ChatMiddleware,
  ChatMiddlewareConfig,
  ChatMiddlewareContext,
  ErrorInfo,
  FinishInfo,
  IterationInfo,
  ToolCallHookContext,
  ToolPhaseCompleteInfo,
  UsageInfo,
} from './types'

/** Check if a middleware should be skipped for instrumentation events. */
function shouldSkipInstrumentation(mw: ChatMiddleware): boolean {
  return mw.name === 'devtools' || mw.name === 'strip-to-spec'
}

/** Build the base context for middleware instrumentation events. */
function instrumentCtx(ctx: ChatMiddlewareContext) {
  return {
    requestId: ctx.requestId,
    streamId: ctx.streamId,
    clientId: ctx.conversationId,
    timestamp: Date.now(),
  }
}

/**
 * Internal middleware runner that manages composed execution of middleware hooks.
 * Created once per chat() invocation.
 */
export class MiddlewareRunner {
  private readonly middlewares: ReadonlyArray<ChatMiddleware>
  private readonly logger: InternalLogger

  constructor(
    middlewares: ReadonlyArray<ChatMiddleware>,
    logger: InternalLogger,
  ) {
    this.middlewares = middlewares
    this.logger = logger
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
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        const result = await mw.onConfig(ctx, current)
        const hasTransform = result !== undefined && result !== null
        if (hasTransform) {
          current = { ...current, ...result }
          if (!skip) {
            this.logger.config(
              `middleware=${mw.name ?? 'unnamed'} keys=${Object.keys(result as object).join(',')}`,
              {
                middleware: mw.name ?? 'unnamed',
                changes: result,
              },
            )
          }
        }
        if (!skip) {
          const base = instrumentCtx(ctx)
          aiEventClient.emit('middleware:hook:executed', {
            ...base,
            middlewareName: mw.name || 'unnamed',
            hookName: 'onConfig',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform,
          })
          if (hasTransform) {
            aiEventClient.emit('middleware:config:transformed', {
              ...base,
              middlewareName: mw.name || 'unnamed',
              iteration: ctx.iteration,
              changes: result as Record<string, unknown>,
            })
          }
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
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        await mw.onStart(ctx)
        if (!skip) {
          this.logger.middleware(
            `hook=onStart middleware=${mw.name ?? 'unnamed'}`,
            { middleware: mw.name ?? 'unnamed', hook: 'onStart' },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onStart',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: false,
          })
        }
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
      const skip = shouldSkipInstrumentation(mw)

      const nextChunks: Array<StreamChunk> = []
      for (const c of chunks) {
        // Cast: @ag-ui/core Zod passthrough types prevent direct `.type` access
        const chunkType = (c as StreamChunk & { type: string }).type
        if (!skip) {
          this.logger.middleware(
            `hook=onChunk middleware=${mw.name ?? 'unnamed'} in=${chunkType}`,
            { middleware: mw.name ?? 'unnamed', hook: 'onChunk', in: c },
          )
        }
        const result = await mw.onChunk(ctx, c)
        if (result === null) {
          // Drop this chunk
          if (!skip) {
            this.logger.middleware(
              `hook=onChunk middleware=${mw.name ?? 'unnamed'} in=${chunkType} out=<dropped>`,
              {
                middleware: mw.name ?? 'unnamed',
                hook: 'onChunk',
                dropped: true,
              },
            )
            aiEventClient.emit('middleware:chunk:transformed', {
              ...instrumentCtx(ctx),
              middlewareName: mw.name || 'unnamed',
              originalChunkType: chunkType,
              resultCount: 0,
              wasDropped: true,
            })
          }
          continue
        } else if (result === undefined) {
          // Pass through — no instrumentation for pass-throughs
          nextChunks.push(c)
        } else if (Array.isArray(result)) {
          // Expand
          nextChunks.push(...result)
          if (!skip) {
            this.logger.middleware(
              `hook=onChunk middleware=${mw.name ?? 'unnamed'} in=${chunkType} out=[${result.map((r: StreamChunk) => (r as StreamChunk & { type: string }).type).join(',')}]`,
              {
                middleware: mw.name ?? 'unnamed',
                hook: 'onChunk',
                in: c,
                out: result,
              },
            )
            aiEventClient.emit('middleware:chunk:transformed', {
              ...instrumentCtx(ctx),
              middlewareName: mw.name || 'unnamed',
              originalChunkType: chunkType,
              resultCount: result.length,
              wasDropped: false,
            })
          }
        } else {
          // Replace
          nextChunks.push(result)
          if (!skip) {
            this.logger.middleware(
              `hook=onChunk middleware=${mw.name ?? 'unnamed'} in=${chunkType} out=${(result as StreamChunk & { type: string }).type}`,
              {
                middleware: mw.name ?? 'unnamed',
                hook: 'onChunk',
                in: c,
                out: result,
              },
            )
            aiEventClient.emit('middleware:chunk:transformed', {
              ...instrumentCtx(ctx),
              middlewareName: mw.name || 'unnamed',
              originalChunkType: chunkType,
              resultCount: 1,
              wasDropped: false,
            })
          }
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
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        const decision = await mw.onBeforeToolCall(ctx, hookCtx)
        const hasTransform = decision !== undefined && decision !== null
        if (!skip) {
          this.logger.middleware(
            `hook=onBeforeToolCall middleware=${mw.name ?? 'unnamed'}`,
            { middleware: mw.name ?? 'unnamed', hook: 'onBeforeToolCall' },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onBeforeToolCall',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform,
          })
        }
        if (hasTransform) {
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
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        await mw.onAfterToolCall(ctx, info)
        if (!skip) {
          this.logger.middleware(
            `hook=onAfterToolCall middleware=${mw.name ?? 'unnamed'}`,
            { middleware: mw.name ?? 'unnamed', hook: 'onAfterToolCall' },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onAfterToolCall',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: false,
          })
        }
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
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        await mw.onUsage(ctx, usage)
        if (!skip) {
          this.logger.middleware(
            `hook=onUsage middleware=${mw.name ?? 'unnamed'}`,
            { middleware: mw.name ?? 'unnamed', hook: 'onUsage' },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onUsage',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: false,
          })
        }
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
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        await mw.onFinish(ctx, info)
        if (!skip) {
          this.logger.middleware(
            `hook=onFinish middleware=${mw.name ?? 'unnamed'}`,
            { middleware: mw.name ?? 'unnamed', hook: 'onFinish' },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onFinish',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: false,
          })
        }
      }
    }
  }

  /**
   * Run onAbort on all middleware in order.
   */
  async runOnAbort(ctx: ChatMiddlewareContext, info: AbortInfo): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onAbort) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        await mw.onAbort(ctx, info)
        if (!skip) {
          this.logger.middleware(
            `hook=onAbort middleware=${mw.name ?? 'unnamed'}`,
            { middleware: mw.name ?? 'unnamed', hook: 'onAbort' },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onAbort',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: false,
          })
        }
      }
    }
  }

  /**
   * Run onError on all middleware in order.
   */
  async runOnError(ctx: ChatMiddlewareContext, info: ErrorInfo): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onError) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        await mw.onError(ctx, info)
        if (!skip) {
          this.logger.middleware(
            `hook=onError middleware=${mw.name ?? 'unnamed'}`,
            { middleware: mw.name ?? 'unnamed', hook: 'onError' },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onError',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: false,
          })
        }
      }
    }
  }

  /**
   * Run onIteration on all middleware in order.
   * Called at the start of each agent loop iteration.
   */
  async runOnIteration(
    ctx: ChatMiddlewareContext,
    info: IterationInfo,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onIteration) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        await mw.onIteration(ctx, info)
        if (!skip) {
          this.logger.middleware(
            `hook=onIteration middleware=${mw.name ?? 'unnamed'}`,
            { middleware: mw.name ?? 'unnamed', hook: 'onIteration' },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onIteration',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: false,
          })
        }
      }
    }
  }

  /**
   * Run onToolPhaseComplete on all middleware in order.
   * Called after all tool calls in an iteration have been processed.
   */
  async runOnToolPhaseComplete(
    ctx: ChatMiddlewareContext,
    info: ToolPhaseCompleteInfo,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onToolPhaseComplete) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        await mw.onToolPhaseComplete(ctx, info)
        if (!skip) {
          this.logger.middleware(
            `hook=onToolPhaseComplete middleware=${mw.name ?? 'unnamed'}`,
            { middleware: mw.name ?? 'unnamed', hook: 'onToolPhaseComplete' },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onToolPhaseComplete',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: false,
          })
        }
      }
    }
  }
}
