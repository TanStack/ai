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

/** Build the base context for middleware instrumentation events. */
function instrumentCtx(ctx: ChatMiddlewareContext<any>) {
  return {
    requestId: ctx.requestId,
    streamId: ctx.streamId,
    clientId: ctx.threadId,
    timestamp: Date.now(),
  }
}

/**
 * Internal middleware runner that manages composed execution of middleware hooks.
 * Created once per chat() invocation.
 */
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
          if (
            toolResume === undefined ||
            priority[next.toolResume] > priority[toolResume]
          ) {
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

  /**
   * Pipe config through all middleware onConfig hooks in order.
   * Each middleware receives the merged config from previous middleware.
   * Partial returns are shallow-merged with the current config.
   */
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
          current = {
            ...current,
            ...result,
            ...('messages' in result && !('providerMessages' in result)
              ? { providerMessages: result.messages }
              : {}),
          }
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

  /**
   * Pipe config through all middleware onStructuredOutputConfig hooks in order.
   * Each middleware receives the merged config from previous middleware.
   * Partial returns are shallow-merged with the current config.
   *
   * Called once at the structured-output boundary, before runOnConfig at the
   * same boundary (which receives a ChatMiddlewareConfig view, no outputSchema).
   */
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
          current = {
            ...current,
            ...result,
            ...('messages' in result && !('providerMessages' in result)
              ? { providerMessages: result.messages }
              : {}),
          }
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
              // `result` is `Partial<StructuredOutputMiddlewareConfig>` —
              // Object.fromEntries(Object.entries(result)) yields the
              // structural `Record<string, unknown>` the event emitter wants
              // without an `as` cast.
              changes: Object.fromEntries(Object.entries(result)),
            })
          }
        }
      }
    }
    return current
  }

  /**
   * Run all `setup` hooks in array order, then assert every declared `provides`
   * capability was actually provided. Wires the last-wins duplicate-provide
   * warning into the registry. Runs before init `onConfig`.
   *
   * Takes the full `ChatMiddlewareContext` — the same stable context the engine
   * threads through every other hook — because it both forwards `ctx` to each
   * `setup` hook and emits instrumentation events from it.
   */
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

  /**
   * Call onStart on all middleware in order.
   */
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
    ctx: ChatMiddlewareContext<TContext>,
    chunk: StreamChunk,
  ): Promise<Array<StreamChunk>> {
    let chunks: Array<StreamChunk> = [chunk]

    for (const mw of this.middlewares) {
      if (!mw.onChunk) continue
      const skip = shouldSkipInstrumentation(mw)

      const nextChunks: Array<StreamChunk> = []
      for (const c of chunks) {
        // Cast: @ag-ui/core Zod passthrough types prevent direct `.type` access
        const chunkType = c.type
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
              `hook=onChunk middleware=${mw.name ?? 'unnamed'} in=${chunkType} out=[${result.map((r: StreamChunk) => r.type).join(',')}]`,
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
              `hook=onChunk middleware=${mw.name ?? 'unnamed'} in=${chunkType} out=${result.type}`,
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
   * Dispatch a sandbox file event to every middleware's `sandbox` hooks, in
   * array order: the catch-all `onFile` then the type-specific hook. Errors are
   * logged and swallowed so one bad hook can't break the run.
   */
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

  /**
   * Run onBeforeToolCall through middleware in order.
   * Returns the first non-void decision, or undefined to continue normally.
   */
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

  /**
   * Run onAfterToolCall on all middleware in order.
   */
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

  /**
   * Run onUsage on all middleware in order.
   */
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

  /**
   * Await ONE terminal hook and RETURN its throw instead of letting it escape
   * the caller's loop, logging it on the `errors` channel first so the failure
   * is never invisible. `undefined` means the hook completed.
   *
   * Capturing (rather than swallowing at this level) is what lets isolation and
   * reporting coexist: every caller gives every middleware its turn, and then
   * each decides on its own whether the collected failures are worth telling the
   * caller about. See {@link runOnFinish} vs {@link runOnAbort} /
   * {@link runOnError}.
   */
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

  /**
   * Run onFinish on all middleware in order.
   *
   * ISOLATED **and** REPORTED. `onFinish` is the only terminal fan-out on the
   * SUCCESS path, and it is where `withPersistence.onFinish` writes the
   * assistant turn through the store. So the two properties are needed together
   * and neither may be traded for the other:
   *
   * - ISOLATION: every middleware's hook runs even if an earlier one threw, so a
   *   transient store error cannot skip a later middleware's own bookkeeping.
   *   Each failure is captured by {@link captureTerminalHook}, not propagated
   *   mid-loop.
   * - REPORTING: after the loop, the failures are rethrown. `chat()`'s catch
   *   treats what we throw as a genuine error (it is not a
   *   `MiddlewareAbortError`, and `structuralInterruptFailure` does not match
   *   it) and rethrows it out of the generator.
   *
   * What that rethrow can and cannot achieve depends on the transport, because
   * this fan-out is awaited AFTER the adapter's `RUN_FINISHED` has already been
   * yielded (`chat()` yields terminal chunks while streaming, then awaits this
   * hook on its way out). The success terminal is therefore already gone; the
   * rethrow can only append to what the consumer saw, never retract it:
   *
   * - NON-DURABLE transport: the throw escapes the generator mid-response, and
   *   the SSE / HTTP-stream encoder turns it into a TRAILING `RUN_ERROR` on the
   *   wire carrying the store's own message and `code`. `ai-client` surfaces
   *   that as an error status, so the user is not told the turn was saved when
   *   it was not.
   * - DURABLE transport: the throw reaches the durability sink instead. The
   *   terminal was already persisted AND forwarded, so the sink deliberately
   *   does NOT append a second, contradictory terminal, and `terminalForwarded`
   *   (see `stream-to-response.ts`) suppresses the rethrow to the live consumer.
   *   The `RUN_FINISHED` stands and the failure is RECORDED SERVER-SIDE on the
   *   sink's `errors` channel. That is the intended outcome, not a gap: the save
   *   failed, not the run — the consumer did receive the complete stream, so
   *   telling it the run errored would be the lie. What the rethrow buys here is
   *   that the sink sees the failure at all; while this loop swallowed, the only
   *   trace anywhere was {@link captureTerminalHook}'s log line.
   *
   * Either way, swallowing is the one option ruled out: a failed
   * `messages.append` would otherwise leave a `completed` run record with the
   * assistant turn missing from storage and nothing beyond a middleware log
   * line, and the client would go on to send a history the server has no record
   * of.
   *
   * A single failure is rethrown AS-IS so the store's own error — its message,
   * `cause`, `code` and `instanceof` identity — is what reaches the caller and
   * the wire; wrapping the common case would bury it. Two or more become an
   * `AggregateError` (never a `MiddlewareAbortError`, so it cannot be mistaken
   * for an abort) rather than picking a winner and dropping the rest.
   */
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

  /**
   * Run onAbort on all middleware in order.
   *
   * ISOLATED and DELIBERATELY SWALLOWED. `onAbort` is a pure teardown fan-out
   * released from `chat()`'s `finally`, on a path where the outcome is already
   * decided: the run stopped, and the caller is being told why. A throw here has
   * nothing better to report than the abort reason it would DISPLACE — the
   * `finally` would surface a flaky store's error in place of "client
   * disconnected" — so failures are logged on the `errors` channel and go no
   * further. That is not a silent failure; it is refusing to let teardown
   * rewrite an outcome it did not produce.
   *
   * Isolation matters independently: these hooks release PER-MIDDLEWARE
   * resources (`withSandbox.onAbort` detaches or destroys the sandbox and stamps
   * `detachedSince`; `withPersistence.onAbort` records the run status through the
   * store), so an unguarded loop turns one transient store error into a
   * permanently leaked sandbox for every middleware ordered after it.
   */
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
        if (failure === undefined && !skip) {
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
   *
   * ISOLATED and DELIBERATELY SWALLOWED, for the same reason as
   * {@link runOnAbort} and NOT merely because it is teardown: the run has
   * already failed, `info.error` IS that failure, and `chat()` rethrows it to the
   * caller the moment this fan-out returns. A propagated hook throw could only
   * REPLACE the run's real error with a teardown artifact — strictly less
   * information for the caller, who is already learning the run failed. Reporting
   * would buy nothing and cost the diagnosis, so failures are logged on the
   * `errors` channel and stop there.
   *
   * Contrast {@link runOnFinish}, where nothing else is telling the caller
   * anything is wrong — which is why that one reports.
   */
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
        if (failure === undefined && !skip) {
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

  /**
   * Run onShouldContinue through middleware in order (AND semantics).
   * Any explicit `false` stops further iterations; `true` / void / undefined pass.
   * Called after `agentLoopStrategy` has already approved continuation.
   */
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

  /**
   * Run onToolPhaseComplete on all middleware in order.
   * Called after all tool calls in an iteration have been processed.
   */
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
