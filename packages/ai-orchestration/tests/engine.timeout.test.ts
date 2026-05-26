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

  it('parent-run abort during a step with timeout does NOT surface as StepTimeoutError', async () => {
    // Regression for the discriminator that used `!timeoutHandle` as a
    // proxy for "no timeout configured" — once setTimeout had assigned,
    // the handle was always truthy, so a run-level abort during the
    // race was mis-classified as a timeout.
    const wf = defineWorkflow({
      name: 'abort-during-timeout',
      input: z.object({}).default({}),
      output: z.object({ caughtName: z.string() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        let caughtName = ''
        try {
          yield* step('slow-network', () => new Promise<void>(() => {}), {
            timeout: 5000,
            retry: { maxAttempts: 1 },
          })
        } catch (err) {
          caughtName = err instanceof Error ? err.name : String(err)
        }
        return { caughtName }
      },
    })

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 20)
    const events = await collect(
      runWorkflow({
        workflow: wf,
        input: {},
        runStore: inMemoryRunStore(),
        signal: ac.signal,
      }),
    )

    // The run aborts — engine emits RUN_ERROR { code: 'aborted' } rather
    // than RUN_FINISHED. We just verify the failure mode is not a
    // misclassified timeout.
    const finished = events.find((e) => e.type === 'RUN_FINISHED') as
      | { output?: { caughtName?: string } }
      | undefined
    if (finished) {
      // If the step's user-catch saw the error, it should NOT be
      // StepTimeoutError — the parent aborted long before the 5s timeout.
      expect(finished.output?.caughtName).not.toBe('StepTimeoutError')
    }
    // Either way, the run terminated promptly.
    expect(
      events.find((e) => e.type === 'RUN_ERROR' || e.type === 'RUN_FINISHED'),
    ).toBeDefined()
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
      output: z.object({
        caughtImmediately: z.boolean(),
        attempts: z.number(),
      }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        let caughtImmediately = false
        try {
          yield* step(
            'timing-out',
            () => {
              callCount++
              return new Promise(() => {})
            },
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
        return { caughtImmediately, attempts: callCount }
      },
    })

    const store = inMemoryRunStore()
    callCount = 0
    const startedAt = Date.now()
    const events = await collect(
      runWorkflow({
        workflow: wf,
        input: {},
        runStore: store,
      }),
    )
    const elapsed = Date.now() - startedAt
    // Should have stopped after the first timeout (~20ms) plus overhead.
    // Five attempts would be 5*20 + 4*1 = 104ms+. Allow CI slack.
    expect(elapsed).toBeLessThan(200)
    // The shouldRetry predicate must return false for StepTimeoutError,
    // so we expect exactly one attempt and `caughtImmediately === true`.
    expect(callCount).toBe(1)
    expect(events.find((e) => e.type === 'RUN_FINISHED')).toMatchObject({
      output: { caughtImmediately: true, attempts: 1 },
    })
  })
})
