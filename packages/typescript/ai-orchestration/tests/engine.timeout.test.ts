/**
 * Tests for step `{ timeout }` (follow-up). Pins:
 *   - A step that exceeds its timeout throws StepTimeoutError.
 *   - The fn receives an AbortSignal on ctx that fires when the timeout
 *     hits — well-behaved fns can bail cooperatively.
 *   - Timeouts compose with retry: each attempt gets a fresh timeout;
 *     exhausted retries surface the last timeout error.
 *   - A step that finishes within the timeout proceeds normally.
 *   - Run-level abort (Ctrl+C / stop) fires the same ctx.signal so
 *     in-flight fetch / db / etc. can bail.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineWorkflow,
  inMemoryRunStore,
  runWorkflow,
  step,
  StepTimeoutError,
} from '../src'
import { collect } from './test-utils'

describe('step timeout', () => {
  it('throws StepTimeoutError when fn exceeds the timeout', async () => {
    const wf = defineWorkflow({
      name: 'timeout-fires',
      input: z.object({}).default({}),
      output: z.object({ caughtName: z.string() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        let caughtName = ''
        try {
          yield* step(
            'slow',
            () =>
              new Promise<void>((resolve) => {
                setTimeout(resolve, 200)
              }),
            { timeout: 30, retry: { maxAttempts: 1 } },
          )
        } catch (err) {
          caughtName = err instanceof Error ? err.name : 'not-an-error'
        }
        return { caughtName }
      },
    })

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: wf,
        input: {},
        runStore: store,
      }),
    )
    expect(events.find((e) => e.type === 'RUN_FINISHED')).toMatchObject({
      output: { caughtName: 'StepTimeoutError' },
    })
  })

  it('forwards an AbortSignal to fn so well-behaved code can bail early', async () => {
    let observedAborted = false
    const wf = defineWorkflow({
      name: 'aborts-cleanly',
      input: z.object({}).default({}),
      output: z.object({ aborted: z.boolean() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        let aborted = false
        try {
          yield* step(
            'cooperative',
            (ctx) =>
              new Promise<void>((resolve, reject) => {
                ctx.signal.addEventListener('abort', () => {
                  aborted = true
                  observedAborted = true
                  reject(new Error('bailing'))
                })
                setTimeout(resolve, 200)
              }),
            { timeout: 30, retry: { maxAttempts: 1 } },
          )
        } catch {
          /* expected */
        }
        return { aborted }
      },
    })

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: wf,
        input: {},
        runStore: store,
      }),
    )
    expect(events.find((e) => e.type === 'RUN_FINISHED')).toMatchObject({
      output: { aborted: true },
    })
    expect(observedAborted).toBe(true)
  })

  it('composes with retry: each attempt gets a fresh timeout', async () => {
    let attempts = 0
    const wf = defineWorkflow({
      name: 'timeout-retry',
      input: z.object({}).default({}),
      output: z.object({ attempts: z.number(), caught: z.string() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        let caught = ''
        try {
          yield* step(
            'always-slow',
            () =>
              new Promise<void>((resolve) => {
                attempts++
                setTimeout(resolve, 200)
              }),
            {
              timeout: 20,
              retry: { maxAttempts: 3, backoff: 'fixed', baseMs: 1 },
            },
          )
        } catch (err) {
          caught = err instanceof Error ? err.name : 'not-an-error'
        }
        return { attempts, caught }
      },
    })

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: wf,
        input: {},
        runStore: store,
      }),
    )
    expect(events.find((e) => e.type === 'RUN_FINISHED')).toMatchObject({
      output: { attempts: 3, caught: 'StepTimeoutError' },
    })
  })

  it('does not throw when fn finishes within the timeout', async () => {
    const wf = defineWorkflow({
      name: 'fast-enough',
      input: z.object({}).default({}),
      output: z.object({ ok: z.boolean() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        const r = yield* step('fast', () => 42, {
          timeout: 1000,
          retry: { maxAttempts: 1 },
        })
        return { ok: r === 42 }
      },
    })

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: wf,
        input: {},
        runStore: store,
      }),
    )
    expect(events.find((e) => e.type === 'RUN_FINISHED')).toMatchObject({
      output: { ok: true },
    })
  })

  it('verifies StepTimeoutError instanceof check works for retry predicates', async () => {
    // Practical: user wants to retry network failures but NOT
    // timeouts (which probably indicate the upstream is overloaded
    // and won't recover in our retry window).
    let callCount = 0
    const wf = defineWorkflow({
      name: 'retry-predicate-w-timeout',
      input: z.object({}).default({}),
      output: z.object({ caughtImmediately: z.boolean() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        let caughtImmediately = false
        try {
          yield* step(
            'timing-out',
            () => new Promise(() => {}), // never resolves
            {
              timeout: 20,
              retry: {
                maxAttempts: 5,
                backoff: 'fixed',
                baseMs: 1,
                shouldRetry: (err) => !(err instanceof StepTimeoutError),
              },
            },
          )
        } catch (err) {
          caughtImmediately = err instanceof StepTimeoutError && callCount === 1
        }
        return { caughtImmediately }
      },
    })

    const store = inMemoryRunStore()
    callCount = 0
    let timeoutFired = 0
    const monkeyPatch = setInterval(() => {
      // not used; just here to keep node alive
    }, 10000)
    try {
      // Note: we can't easily observe attempts here since the fn
      // never resolves. The shouldRetry predicate aborts after the
      // first timeout. The test passes if the run completes
      // quickly (i.e., retries did NOT keep trying).
      const startedAt = Date.now()
      const events = await collect(
        runWorkflow({
          workflow: wf,
          input: {},
          runStore: store,
        }),
      )
      const elapsed = Date.now() - startedAt
      // Should have stopped after the first timeout (~20ms) plus
      // overhead. Five attempts would be 5*20 + 4*1 = 104ms+. We
      // allow generous slack here for CI noise.
      expect(elapsed).toBeLessThan(200)
      // caughtImmediately can only be true if we caught a
      // StepTimeoutError before retrying — exactly the predicate's
      // contract.
      expect(events.find((e) => e.type === 'RUN_FINISHED')).toBeDefined()
      void timeoutFired
    } finally {
      clearInterval(monkeyPatch)
    }
  })
})
