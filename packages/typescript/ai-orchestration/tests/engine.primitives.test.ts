/**
 * Tests for the step / now / uuid primitives added in step 4 of the
 * durability roadmap. Pins that:
 *   - `step(name, fn)` runs `fn` once, persists the result, and replays
 *     return the recorded value without invoking `fn` again.
 *   - `step` provides a deterministic `ctx.id` for idempotency keys.
 *   - `step` failures persist as error records and rethrow on replay.
 *   - `now()` records `Date.now()` once and the recorded value is what
 *     subsequent replays see (not a fresh `Date.now()` call).
 *   - `uuid()` records a fresh v4 UUID once and replays see the same.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  approve,
  defineWorkflow,
  inMemoryRunStore,
  now,
  runWorkflow,
  step,
  uuid,
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

describe('step()', () => {
  it('runs fn once and persists the result to the log', async () => {
    let callCount = 0
    const wf = defineWorkflow({
      name: 'step-once',
      input: z.object({}).default({}),
      output: z.object({ data: z.string() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        const data = yield* step('fetch', () => {
          callCount++
          return 'hello'
        })
        yield* approve({ title: 'go?' })
        return { data }
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
    expect(callCount).toBe(1)

    const log = await store.getSteps(runId)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      kind: 'step',
      name: 'fetch',
      result: 'hello',
    })
  })

  it('passes a deterministic ctx.id to fn', async () => {
    const idsSeen: Array<string> = []
    const wf = defineWorkflow({
      name: 'step-ctx',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* step('a', (ctx) => {
          idsSeen.push(ctx.id)
          return 1
        })
        yield* step('b', (ctx) => {
          idsSeen.push(ctx.id)
          return 2
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

    expect(idsSeen).toHaveLength(2)
    // Two different steps → two different IDs, both starting with the
    // run prefix and ending with the step's log index.
    expect(idsSeen[0]).toMatch(/:step-0$/)
    expect(idsSeen[1]).toMatch(/:step-1$/)
    expect(idsSeen[0]).not.toBe(idsSeen[1])
  })

  it('does NOT re-execute fn on replay', async () => {
    let callCount = 0
    const wf = defineWorkflow({
      name: 'step-replay',
      input: z.object({}).default({}),
      output: z.object({ data: z.string() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        const data = yield* step('fetch', () => {
          callCount++
          return 'world'
        })
        yield* approve({ title: 'go?' })
        return { data }
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
    expect(callCount).toBe(1)

    // Force replay.
    ;(store as unknown as { getLive: (id: string) => undefined }).getLive = (
      _id,
    ) => undefined

    const phase2 = await collect(
      runWorkflow({
        workflow: wf as any,
        runId,
        approval: { approvalId: 'a1', approved: true },
        runStore: store,
      }),
    )

    // fn was called once in phase 1; replay must NOT call it again.
    expect(callCount).toBe(1)

    const finished = phase2.find((e) => e.type === 'RUN_FINISHED') as unknown as
      | { output: { data: string } }
      | undefined
    expect(finished?.output.data).toBe('world')
  })

  it('persists thrown errors and re-throws them on replay', async () => {
    let callCount = 0
    const wf = defineWorkflow({
      name: 'step-throws',
      input: z.object({}).default({}),
      output: z.object({ caught: z.boolean() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        let caught = false
        try {
          yield* step('boom', () => {
            callCount++
            throw new Error('kaboom')
          })
        } catch (err) {
          caught = err instanceof Error && err.message === 'kaboom'
        }
        yield* approve({ title: 'go?' })
        return { caught }
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
    expect(callCount).toBe(1)

    const log = await store.getSteps(runId)
    expect(log[0]?.error?.message).toBe('kaboom')

    ;(store as unknown as { getLive: (id: string) => undefined }).getLive = (
      _id,
    ) => undefined

    const phase2 = await collect(
      runWorkflow({
        workflow: wf as any,
        runId,
        approval: { approvalId: 'a1', approved: true },
        runStore: store,
      }),
    )

    // Replay throws the recorded error back into user code without
    // re-invoking fn. User's try/catch must still observe `caught`.
    expect(callCount).toBe(1)
    const finished = phase2.find((e) => e.type === 'RUN_FINISHED') as unknown as
      | { output: { caught: boolean } }
      | undefined
    expect(finished?.output.caught).toBe(true)
  })
})

describe('now()', () => {
  it('records Date.now() once and replay sees the same value', async () => {
    const wf = defineWorkflow({
      name: 'now-replay',
      input: z.object({}).default({}),
      output: z.object({ ts: z.number() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        const ts = yield* now()
        yield* approve({ title: 'go?' })
        return { ts }
      },
    })

    const store = inMemoryRunStore()
    const phase1 = await collect(
      runWorkflow({ workflow: wf as any, input: {}, runStore: store }),
    )
    const runId = findRunId(phase1)
    const log = await store.getSteps(runId)
    const recordedTs = log[0]?.result as number
    expect(typeof recordedTs).toBe('number')

    // Force replay; if `now()` were calling Date.now() afresh, the
    // returned value would change between calls (or even within a
    // single millisecond, the persistence-via-log path would skip).
    ;(store as unknown as { getLive: (id: string) => undefined }).getLive = (
      _id,
    ) => undefined

    const phase2 = await collect(
      runWorkflow({
        workflow: wf as any,
        runId,
        approval: { approvalId: 'a1', approved: true },
        runStore: store,
      }),
    )

    const finished = phase2.find((e) => e.type === 'RUN_FINISHED') as unknown as
      | { output: { ts: number } }
      | undefined
    expect(finished?.output.ts).toBe(recordedTs)
  })
})

describe('uuid()', () => {
  it('records a fresh UUID once and replay sees the same value', async () => {
    const wf = defineWorkflow({
      name: 'uuid-replay',
      input: z.object({}).default({}),
      output: z.object({ id: z.string() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        const id = yield* uuid()
        yield* approve({ title: 'go?' })
        return { id }
      },
    })

    const store = inMemoryRunStore()
    const phase1 = await collect(
      runWorkflow({ workflow: wf as any, input: {}, runStore: store }),
    )
    const runId = findRunId(phase1)
    const log = await store.getSteps(runId)
    const recordedId = log[0]?.result as string
    expect(typeof recordedId).toBe('string')
    expect(recordedId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )

    ;(store as unknown as { getLive: (id: string) => undefined }).getLive = (
      _id,
    ) => undefined

    const phase2 = await collect(
      runWorkflow({
        workflow: wf as any,
        runId,
        approval: { approvalId: 'a1', approved: true },
        runStore: store,
      }),
    )

    const finished = phase2.find((e) => e.type === 'RUN_FINISHED') as unknown as
      | { output: { id: string } }
      | undefined
    expect(finished?.output.id).toBe(recordedId)
  })
})
