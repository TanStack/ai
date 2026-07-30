import { describe, expect, it, vi } from 'vitest'
import { MiddlewareRunner } from '../src/activities/chat/middleware/compose'
import { InternalLogger } from '../src/adapter-internals'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
} from '../src/activities/chat/middleware/types'
import type { Logger } from '../src/logger/types'

/**
 * TERMINAL-HOOK ISOLATION, AND WHO REPORTS.
 *
 * All three terminal fan-outs are ISOLATED: each middleware's hook releases ITS
 * OWN resources, so an unguarded loop turns one middleware's transient failure
 * into a skipped teardown for every middleware ordered after it — e.g.
 * `withPersistence.onAbort`'s `runs.update` failing on a flaky store means
 * `withSandbox.onAbort` never runs, so the sandbox is never detached or destroyed
 * and leaks permanently.
 *
 * They differ in whether the collected failures then REACH THE CALLER:
 *
 * - `onAbort` / `onError` swallow (logged on `errors`). The outcome is already
 *   decided and being reported — the abort reason, or the run's real error — and
 *   a hook throw could only DISPLACE it with a teardown artifact.
 * - `onFinish` rethrows after the loop. It is the SUCCESS path, and it is where
 *   `withPersistence.onFinish` saves the transcript; swallowing there reports
 *   `outcome: success` for a run whose assistant turn never reached storage.
 */

function collectingLogger(): { logger: InternalLogger; errors: Array<string> } {
  const errors: Array<string> = []
  const sink: Logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message) => errors.push(message),
  }
  return {
    logger: new InternalLogger(sink, {
      request: false,
      provider: false,
      output: false,
      middleware: false,
      tools: false,
      agentLoop: false,
      config: false,
      errors: true,
      sandbox: false,
    }),
    errors,
  }
}

/** A context stub with only the fields the instrumentation path reads. */
function ctx(): ChatMiddlewareContext<unknown> {
  return {
    threadId: 't1',
    runId: 'r1',
    iteration: 0,
    chunkIndex: 0,
    context: undefined,
  } as unknown as ChatMiddlewareContext<unknown>
}

const abortInfo = { reason: 'client disconnected', duration: 1 }
const finishInfo = { finishReason: 'stop' as const, duration: 1, content: '' }
const errorInfo = { error: new Error('run failed'), duration: 1 }

describe('terminal middleware hooks are isolated per middleware', () => {
  it('runs every later onAbort after an earlier one throws, and logs the failure', async () => {
    const later = vi.fn()
    const { logger, errors } = collectingLogger()
    const middlewares: Array<ChatMiddleware<unknown>> = [
      {
        name: 'flaky-persistence',
        onAbort: () => Promise.reject(new Error('store down')),
      },
      { name: 'sandbox', onAbort: later },
    ]

    const runner = new MiddlewareRunner(middlewares, logger)
    // The original abort reason must survive: this call must not reject.
    await expect(runner.runOnAbort(ctx(), abortInfo)).resolves.toBeUndefined()
    expect(later).toHaveBeenCalledTimes(1)
    expect(errors.join('\n')).toContain('middleware onAbort hook failed')
  })

  it('runs every later onFinish after an earlier one throws, and still surfaces the failure to the caller', async () => {
    const later = vi.fn()
    const { logger, errors } = collectingLogger()
    const storeDown = new Error('messages.append failed')
    const runner = new MiddlewareRunner<unknown>(
      [
        {
          name: 'flaky-persistence',
          onFinish: () => Promise.reject(storeDown),
        },
        { name: 'sandbox', onFinish: later },
      ],
      logger,
    )

    // Isolation: the later middleware's onFinish is not skipped...
    const settled = await runner
      .runOnFinish(ctx(), finishInfo)
      .then(() => undefined)
      .catch((error: unknown) => error)
    expect(later).toHaveBeenCalledTimes(1)
    // ...and reporting: the caller learns the transcript was not saved. The
    // store's own error is rethrown as-is, not wrapped.
    expect(settled).toBe(storeDown)
    expect(errors.join('\n')).toContain('middleware onFinish hook failed')
  })

  it('aggregates when several onFinish hooks fail, without picking a winner', async () => {
    const { logger } = collectingLogger()
    const first = new Error('store down')
    const second = new Error('sandbox snapshot failed')
    const runner = new MiddlewareRunner<unknown>(
      [
        { name: 'persistence', onFinish: () => Promise.reject(first) },
        { name: 'sandbox', onFinish: () => Promise.reject(second) },
      ],
      logger,
    )

    const settled = await runner
      .runOnFinish(ctx(), finishInfo)
      .then(() => undefined)
      .catch((error: unknown) => error)
    expect(settled).toBeInstanceOf(AggregateError)
    if (!(settled instanceof AggregateError)) throw new Error('unreachable')
    expect(settled.errors).toEqual([first, second])
    expect(settled.message).toContain('persistence, sandbox')
    // It must not be mistaken for a middleware abort by chat()'s catch.
    expect(settled.name).toBe('AggregateError')
  })

  it('runs every later onError after an earlier one throws, preserving the run error', async () => {
    const later = vi.fn()
    const { logger, errors } = collectingLogger()
    const runner = new MiddlewareRunner<unknown>(
      [
        { name: 'flaky', onError: () => Promise.reject(new Error('boom')) },
        { name: 'sandbox', onError: later },
      ],
      logger,
    )

    await expect(runner.runOnError(ctx(), errorInfo)).resolves.toBeUndefined()
    expect(later).toHaveBeenCalledTimes(1)
    expect(errors.join('\n')).toContain('middleware onError hook failed')
  })
})
