import { aiEventClient } from '@tanstack/ai-event-client'
import type { AgentLoopState, StreamChunk } from '../../../types'
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
  InterruptBoundaryPhase,
  InterruptResolutionCollection,
  InterruptToolResume,
  IterationInfo,
  SandboxFileHookEvent,
  StructuredOutputMiddlewareConfig,
  ToolCallHookContext,
  ToolPhaseCompleteInfo,
  UsageInfo,
} from './types'
import type {
  GenericInterruptRequest,
  InterruptDefinition,
} from '../../../interrupt-definition'

/** One middleware's terminal-hook throw, captured instead of propagated. */
interface HookFailure {
  middleware: string
  error: unknown
}

/** Check if a middleware should be skipped for instrumentation events. */
function shouldSkipInstrumentation(mw: ChatMiddleware<any, any>): boolean {
  return mw.name === 'devtools' || mw.name === 'strip-to-spec'
}

function applyOnChunkResult(input: {
  result: StreamChunk | Array<StreamChunk> | null | undefined
  original: StreamChunk
  chunkType: StreamChunk['type']
  nextChunks: Array<StreamChunk>
  skip: boolean
  mw: ChatMiddleware<any, any>
  ctx: ChatMiddlewareContext<any>
  logger: InternalLogger
}): void {
  const { result, original, chunkType, nextChunks, skip, mw, ctx, logger } =
    input
  if (result === null) {
    if (!skip) {
      logger.middleware(
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
    return
  }
  if (result === undefined) {
    nextChunks.push(original)
    return
  }
  if (Array.isArray(result)) {
    nextChunks.push(...result)
    if (!skip) {
      logger.middleware(
        `hook=onChunk middleware=${mw.name ?? 'unnamed'} in=${chunkType} out=[${result.map((r: StreamChunk) => r.type).join(',')}]`,
        {
          middleware: mw.name ?? 'unnamed',
          hook: 'onChunk',
          in: original,
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
    return
  }
  nextChunks.push(result)
  if (!skip) {
    logger.middleware(
      `hook=onChunk middleware=${mw.name ?? 'unnamed'} in=${chunkType} out=${result.type}`,
      {
        middleware: mw.name ?? 'unnamed',
        hook: 'onChunk',
        in: original,
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

/** Build the base context for middleware instrumentation events. */
function instrumentCtx(ctx: ChatMiddlewareContext<any>) {
  return {
    requestId: ctx.requestId,
    streamId: ctx.streamId,
    clientId: ctx.threadId,
    timestamp: Date.now(),
  }
}

export class MiddlewareRunner<
  TContext = unknown,
  TInterruptDefinitions extends InterruptDefinition<any, any, any, any> =
    InterruptDefinition<any, any, any, any>,
> {
  private readonly middlewares: ReadonlyArray<
    ChatMiddleware<TContext, TInterruptDefinitions>
  >
  private readonly logger: InternalLogger

  constructor(
    middlewares: ReadonlyArray<ChatMiddleware<TContext, TInterruptDefinitions>>,
    logger: InternalLogger,
  ) {
    this.middlewares = middlewares
    this.logger = logger
  }

  get hasMiddleware(): boolean {
    return this.middlewares.length > 0
  }

  async runOnInterruptBoundary(
    ctx: ChatMiddlewareContext<TContext> & { phase: InterruptBoundaryPhase },
  ): Promise<ReadonlyArray<GenericInterruptRequest<TInterruptDefinitions>>> {
    const requests: Array<GenericInterruptRequest<TInterruptDefinitions>> = []
    for (const mw of this.middlewares) {
      if (mw.onInterruptBoundary) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        const result = await mw.onInterruptBoundary(ctx)
        if (result?.interrupts) requests.push(...result.interrupts)
        if (!skip) {
          this.logger.middleware(
            `hook=onInterruptBoundary middleware=${mw.name ?? 'unnamed'}`,
            {
              middleware: mw.name ?? 'unnamed',
              hook: 'onInterruptBoundary',
            },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onInterruptBoundary',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: result?.interrupts !== undefined,
          })
        }
      }
    }
    return requests
  }

  async runOnInterruptResolution(
    ctx: ChatMiddlewareContext<TContext>,
    resolutions: InterruptResolutionCollection<TInterruptDefinitions>,
  ): Promise<{ toolResume?: InterruptToolResume }> {
    let toolResume: InterruptToolResume | undefined
    for (const mw of this.middlewares) {
      if (mw.onInterruptResolution) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        const next = await mw.onInterruptResolution(ctx, resolutions)
        if (next?.toolResume !== undefined) {
          const priority: Record<InterruptToolResume, number> = {
            continue: 0,
            cancel: 1,
            stop: 2,
          }
          const isIncompleteToolResume =
            toolResume === undefined ||
            priority[next.toolResume] > priority[toolResume]
          if (isIncompleteToolResume) {
            toolResume = next.toolResume
          }
        }
        if (!skip) {
          this.logger.middleware(
            `hook=onInterruptResolution middleware=${mw.name ?? 'unnamed'}`,
            {
              middleware: mw.name ?? 'unnamed',
              hook: 'onInterruptResolution',
            },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onInterruptResolution',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: next !== undefined,
          })
        }
      }
    }
    return toolResume === undefined ? {} : { toolResume }
  }

  async runOnConfig(
    ctx: ChatMiddlewareContext<TContext>,
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
              `middleware=${mw.name ?? 'unnamed'} keys=${Object.keys(result).join(',')}`,
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
              changes: result,
            })
          }
        }
      }
    }
    return current
  }

  async runOnStructuredOutputConfig(
    ctx: ChatMiddlewareContext<TContext>,
    config: StructuredOutputMiddlewareConfig,
  ): Promise<StructuredOutputMiddlewareConfig> {
    let current = config
    for (const mw of this.middlewares) {
      if (mw.onStructuredOutputConfig) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        const result = await mw.onStructuredOutputConfig(ctx, current)
        const hasTransform = result !== undefined && result !== null
        if (hasTransform) {
          current = { ...current, ...result }
          if (!skip) {
            this.logger.config(
              `middleware=${mw.name ?? 'unnamed'} keys=${Object.keys(result).join(',')}`,
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
            hookName: 'onStructuredOutputConfig',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform,
          })
          if (hasTransform) {
            aiEventClient.emit('middleware:config:transformed', {
              ...base,
              middlewareName: mw.name || 'unnamed',
              iteration: ctx.iteration,
              changes: Object.fromEntries(Object.entries(result)),
            })
          }
        }
      }
    }
    return current
  }

  async runSetup(ctx: ChatMiddlewareContext<TContext>): Promise<void> {
    ctx.capabilities.setOnDuplicate((name) => {
      this.logger.warn(
        `capability "${name}" was provided more than once; last provider wins`,
        { capability: name },
      )
    })

    for (const mw of this.middlewares) {
      if (mw.setup) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        await mw.setup(ctx)
        if (!skip) {
          this.logger.middleware(
            `hook=setup middleware=${mw.name ?? 'unnamed'}`,
            { middleware: mw.name ?? 'unnamed', hook: 'setup' },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'setup',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: false,
          })
        }
      }
    }

    for (const mw of this.middlewares) {
      for (const handle of mw.provides ?? []) {
        if (!ctx.capabilities.has(handle)) {
          throw new Error(
            `Middleware "${mw.name ?? 'unnamed'}" declares it provides ` +
              `"${handle.capabilityName}" but never called provide() in setup().`,
          )
        }
      }
    }
  }

  async runOnStart(ctx: ChatMiddlewareContext<TContext>): Promise<void> {
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

  async runOnChunk(
    ctx: ChatMiddlewareContext<TContext>,
    chunk: StreamChunk,
  ): Promise<Array<StreamChunk>> {
    let chunks: Array<StreamChunk> = [chunk]

    for (const mw of this.middlewares) {
      if (!mw.onChunk) continue
      const skip = shouldSkipInstrumentation(mw)

      const nextChunks: Array<StreamChunk> = []
      for (const c of chunks) {
        const chunkType = c.type
        if (!skip) {
          this.logger.middleware(
            `hook=onChunk middleware=${mw.name ?? 'unnamed'} in=${chunkType}`,
            { middleware: mw.name ?? 'unnamed', hook: 'onChunk', in: c },
          )
        }
        const result = await mw.onChunk(ctx, c)
        applyOnChunkResult({
          result,
          original: c,
          chunkType,
          nextChunks,
          skip,
          mw,
          ctx,
          logger: this.logger,
        })
      }
      chunks = nextChunks
    }

    return chunks
  }

  async runSandboxFile(
    ctx: ChatMiddlewareContext<TContext>,
    event: SandboxFileHookEvent,
  ): Promise<void> {
    const typed = (
      {
        create: 'onFileCreate',
        change: 'onFileChange',
        delete: 'onFileDelete',
      } as const
    )[event.type]
    for (const mw of this.middlewares) {
      const hooks = mw.sandbox
      if (!hooks) continue
      for (const fn of [hooks.onFile, hooks[typed]]) {
        if (!fn) continue
        try {
          await fn(ctx, event)
        } catch (error) {
          this.logger.sandbox(
            `hook=${typed} middleware=${mw.name ?? 'unnamed'} threw`,
            { middleware: mw.name ?? 'unnamed', error },
          )
        }
      }
    }
  }

  async runOnBeforeToolCall(
    ctx: ChatMiddlewareContext<TContext>,
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

  async runOnAfterToolCall(
    ctx: ChatMiddlewareContext<TContext>,
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

  async runOnUsage(
    ctx: ChatMiddlewareContext<TContext>,
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

  private async captureTerminalHook(
    mw: ChatMiddleware<TContext, TInterruptDefinitions>,
    hookName: 'onFinish' | 'onAbort' | 'onError',
    invoke: () => void | Promise<void>,
  ): Promise<HookFailure | undefined> {
    try {
      await invoke()
      return undefined
    } catch (error) {
      this.logger.errors(`middleware ${hookName} hook failed`, {
        middleware: mw.name ?? 'unnamed',
        hook: hookName,
        error,
      })
      return { middleware: mw.name ?? 'unnamed', error }
    }
  }

  async runOnFinish(
    ctx: ChatMiddlewareContext<TContext>,
    info: FinishInfo,
  ): Promise<void> {
    const failures: Array<HookFailure> = []
    let firstFailure: HookFailure | undefined

    for (const mw of this.middlewares) {
      const hook = mw.onFinish
      if (hook) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        const failure = await this.captureTerminalHook(mw, 'onFinish', () =>
          hook.call(mw, ctx, info),
        )
        if (failure !== undefined) {
          firstFailure ??= failure
          failures.push(failure)
          continue
        }
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

    if (firstFailure !== undefined) {
      throw failures.length === 1
        ? firstFailure.error
        : new AggregateError(
            failures.map((f) => f.error),
            `${failures.length} middleware onFinish hooks failed: ` +
              failures.map((f) => f.middleware).join(', '),
          )
    }
  }

  async runOnAbort(
    ctx: ChatMiddlewareContext<TContext>,
    info: AbortInfo,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      const hook = mw.onAbort
      if (hook) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        const failure = await this.captureTerminalHook(mw, 'onAbort', () =>
          hook.call(mw, ctx, info),
        )
        const hasFailure = failure === undefined && !skip
        if (hasFailure) {
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

  async runOnError(
    ctx: ChatMiddlewareContext<TContext>,
    info: ErrorInfo,
  ): Promise<void> {
    for (const mw of this.middlewares) {
      const hook = mw.onError
      if (hook) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        const failure = await this.captureTerminalHook(mw, 'onError', () =>
          hook.call(mw, ctx, info),
        )
        const hasFailure = failure === undefined && !skip
        if (hasFailure) {
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

  async runOnIteration(
    ctx: ChatMiddlewareContext<TContext>,
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

  async runOnShouldContinue(
    ctx: ChatMiddlewareContext<TContext>,
    state: AgentLoopState,
  ): Promise<boolean> {
    for (const mw of this.middlewares) {
      if (mw.onShouldContinue) {
        const skip = shouldSkipInstrumentation(mw)
        const start = Date.now()
        const result = await mw.onShouldContinue(ctx, state)
        if (!skip) {
          this.logger.middleware(
            `hook=onShouldContinue middleware=${mw.name ?? 'unnamed'}`,
            {
              middleware: mw.name ?? 'unnamed',
              hook: 'onShouldContinue',
              result,
            },
          )
          aiEventClient.emit('middleware:hook:executed', {
            ...instrumentCtx(ctx),
            middlewareName: mw.name || 'unnamed',
            hookName: 'onShouldContinue',
            iteration: ctx.iteration,
            duration: Date.now() - start,
            hasTransform: result === false,
          })
        }
        if (result === false) {
          return false
        }
      }
    }
    return true
  }

  async runOnToolPhaseComplete(
    ctx: ChatMiddlewareContext<TContext>,
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
