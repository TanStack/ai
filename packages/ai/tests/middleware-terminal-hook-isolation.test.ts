import { describe, expect, it, vi } from 'vitest'
import { MiddlewareRunner } from '../src/activities/chat/middleware/compose'
import { InternalLogger } from '../src/adapter-internals'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
} from '../src/activities/chat/middleware/types'
import type { Logger } from '../src/logger/types'

/**
 * TERMINAL-HOOK ISOLATION.
 *
 * `runOnAbort` / `runOnFinish` / `runOnError` are teardown fan-outs: each
 * middleware's hook releases ITS OWN resources. An unguarded loop turns one
 * middleware's transient failure into a skipped teardown for every middleware
 * ordered after it — e.g. `withPersistence.onAbort`'s `runs.update` failing on a
 * flaky store means `withSandbox.onAbort` never runs, so the sandbox is never
 * detached or destroyed and leaks permanently. `runOnAbort` is additionally
 * awaited from `chat()`'s `finally`, so a throw there also DISCARDS the original
 * abort reason and surfaces the store error in its place.
 *
 * `ai-sandbox`'s `dispatchDefinitionHooks` already settled the rule these tests
 * pin: swallow per hook so one bad hook cannot break the run, but log under
 * `errors` first so the failure is never invisible.
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

  it('runs every later onFinish after an earlier one throws', async () => {
    const later = vi.fn()
    const { logger, errors } = collectingLogger()
    const runner = new MiddlewareRunner<unknown>(
      [
        { name: 'flaky', onFinish: () => Promise.reject(new Error('boom')) },
        { name: 'sandbox', onFinish: later },
      ],
      logger,
    )

    await expect(runner.runOnFinish(ctx(), finishInfo)).resolves.toBeUndefined()
    expect(later).toHaveBeenCalledTimes(1)
    expect(errors.join('\n')).toContain('middleware onFinish hook failed')
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
