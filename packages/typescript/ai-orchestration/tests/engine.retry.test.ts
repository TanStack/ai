/**
 * Tests for per-step retry policy (step 10 of the durability roadmap).
 * Pins:
 *   - `step({ retry: { maxAttempts: N } })` retries up to N times.
 *   - Each attempt is captured on the StepRecord's `attempts` array.
 *   - `shouldRetry` predicate can abort retries early.
 *   - workflow `defaultStepRetry` applies when the step doesn't carry
 *     its own `{ retry }`; per-step override wins.
 *   - First-attempt success leaves `attempts` undefined on the
 *     persisted record (no retry noise for the happy path).
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  approve,
  defineWorkflow,
  inMemoryRunStore,
  runWorkflow,
  step,
} from '../src'
import type { StreamChunk } from '@tanstack/ai'

interface RunStartedChunk {
  type: 'RUN_STARTED'
  runId: string
}

async function collect(
  iter: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const c of iter) out.push(c)
  return out
}

function findRunId(events: Array<StreamChunk>): string {
  const started = events.find((e) => e.type === 'RUN_STARTED') as
    | RunStartedChunk
    | undefined
  if (!started) throw new Error('no RUN_STARTED')
  return started.runId
}

describe('per-step retry', () => {
  it('retries up to maxAttempts and records each attempt', async () => {
    let callCount = 0
    const wf = defineWorkflow({
      name: 'retry-eventually-succeeds',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* step(
          'flaky',
          () => {
            callCount++
            if (callCount < 3) throw new Error(`fail attempt ${callCount}`)
            return 'ok'
          },
          {
            retry: {
              maxAttempts: 5,
              backoff: 'fixed',
              baseMs: 1, // keep tests fast
            },
          },
        )
        yield* approve({ title: 'go?' })
        return {}
      },
    })

    const store = inMemoryRunStore()
    const phase1 = await collect(
      runWorkflow({
        workflow: wf as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(phase1)

    expect(callCount).toBe(3)
    const log = await store.getSteps(runId)
    expect(log).toHaveLength(1)
    expect(log[0]?.kind).toBe('step')
    expect(log[0]?.result).toBe('ok')
    expect(log[0]?.attempts).toHaveLength(3)
    expect(log[0]?.attempts?.[0]?.error?.message).toBe('fail attempt 1')
    expect(log[0]?.attempts?.[1]?.error?.message).toBe('fail attempt 2')
    expect(log[0]?.attempts?.[2]?.result).toBe('ok')
  })

  it('first-attempt success leaves attempts undefined on the log record', async () => {
    const wf = defineWorkflow({
      name: 'retry-happy-path',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* step('fine', () => 'done', {
          retry: { maxAttempts: 3, baseMs: 1 },
        })
        yield* approve({ title: 'go?' })
        return {}
      },
    })

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: wf as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(events)
    const log = await store.getSteps(runId)
    expect(log[0]?.result).toBe('done')
    expect(log[0]?.attempts).toBeUndefined()
  })

  it('shouldRetry predicate can abort retries early', async () => {
    let callCount = 0
    const wf = defineWorkflow({
      name: 'retry-shouldnt',
      input: z.object({}).default({}),
      output: z.object({ caught: z.boolean() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        let caught = false
        try {
          yield* step(
            'fatal',
            () => {
              callCount++
              throw new Error('do not retry me')
            },
            {
              retry: {
                maxAttempts: 5,
                baseMs: 1,
                shouldRetry: (err) =>
                  err instanceof Error && err.message !== 'do not retry me',
              },
            },
          )
        } catch {
          caught = true
        }
        return { caught }
      },
    })

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: wf as any,
        input: {},
        runStore: store,
      }),
    )

    // shouldRetry returned false on attempt 1 → no further attempts.
    expect(callCount).toBe(1)
    const finished = events.find((e) => e.type === 'RUN_FINISHED') as unknown as
      | { output: { caught: boolean } }
      | undefined
    expect(finished?.output.caught).toBe(true)
  })

  it('exhausting maxAttempts throws into user code with the last error', async () => {
    let callCount = 0
    const wf = defineWorkflow({
      name: 'retry-exhausted',
      input: z.object({}).default({}),
      output: z.object({ caught: z.string() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        let msg = ''
        try {
          yield* step(
            'never-recovers',
            () => {
              callCount++
              throw new Error(`fail ${callCount}`)
            },
            { retry: { maxAttempts: 3, baseMs: 1 } },
          )
        } catch (err) {
          msg = err instanceof Error ? err.message : String(err)
        }
        return { caught: msg }
      },
    })

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: wf as any,
        input: {},
        runStore: store,
      }),
    )

    expect(callCount).toBe(3)
    const finished = events.find((e) => e.type === 'RUN_FINISHED') as unknown as
      | { output: { caught: string } }
      | undefined
    expect(finished?.output.caught).toBe('fail 3')
  })
})

describe('workflow-level defaultStepRetry', () => {
  it('applies when the step does not carry its own retry option', async () => {
    let callCount = 0
    const wf = defineWorkflow({
      name: 'default-retry',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      defaultStepRetry: { maxAttempts: 4, baseMs: 1 },
      run: async function* () {
        yield* step('uses-default', () => {
          callCount++
          if (callCount < 3) throw new Error('not yet')
          return 'finally'
        })
        return {}
      },
    })

    const store = inMemoryRunStore()
    await collect(
      runWorkflow({
        workflow: wf as any,
        input: {},
        runStore: store,
      }),
    )
    expect(callCount).toBe(3)
  })

  it('per-step retry overrides defaultStepRetry', async () => {
    let callCount = 0
    const wf = defineWorkflow({
      name: 'override-retry',
      input: z.object({}).default({}),
      output: z.object({ caught: z.string() }),
      state: z.object({}).default({}),
      agents: {},
      // workflow default would allow 5 attempts; the step opts down to 1.
      defaultStepRetry: { maxAttempts: 5, baseMs: 1 },
      run: async function* () {
        let msg = ''
        try {
          yield* step(
            'no-retries',
            () => {
              callCount++
              throw new Error('fail')
            },
            { retry: { maxAttempts: 1, baseMs: 1 } },
          )
        } catch (err) {
          msg = err instanceof Error ? err.message : String(err)
        }
        return { caught: msg }
      },
    })

    const store = inMemoryRunStore()
    await collect(
      runWorkflow({
        workflow: wf as any,
        input: {},
        runStore: store,
      }),
    )
    expect(callCount).toBe(1)
  })
})
