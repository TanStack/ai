/**
 * Tests for the generic waitForSignal primitive + sleep typed wrapper
 * (step 5 of the durability roadmap). Pins:
 *   - waitForSignal pauses the run with `waitingFor` set, emits
 *     `run.paused`, and closes the SSE.
 *   - The host can resume by passing `signalDelivery` to runWorkflow;
 *     the payload becomes the value of `yield* waitForSignal()`.
 *   - The replay path delivers the same payload by reading the
 *     persisted signal record from the log.
 *   - sleep / sleepUntil are sugar on waitForSignal('__timer'), with
 *     the deadline plumbed onto `waitingFor.deadline`.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineWorkflow,
  inMemoryRunStore,
  runWorkflow,
  sleep,
  sleepUntil,
  TIMER_SIGNAL_NAME,
  waitForSignal,
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

describe('waitForSignal()', () => {
  it('pauses with waitingFor set, emits run.paused, and closes the SSE', async () => {
    const wf = defineWorkflow({
      name: 'webhook-wait',
      input: z.object({}).default({}),
      output: z.object({ payload: z.unknown() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        const payload = yield* waitForSignal<{ ok: boolean }>(
          'webhook-received',
          { meta: { source: 'stripe' } },
        )
        return { payload }
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

    // Stream closed before RUN_FINISHED — i.e., we paused.
    expect(phase1.map((e) => e.type)).not.toContain('RUN_FINISHED')

    // run.paused CUSTOM event fired for the push-discovery channel.
    const paused = phase1.find(
      (e) =>
        e.type === 'CUSTOM' && (e as { name?: string }).name === 'run.paused',
    ) as
      | { value: { runId: string; signalName: string; kind: string } }
      | undefined
    expect(paused).toBeDefined()
    expect(paused!.value.signalName).toBe('webhook-received')
    expect(paused!.value.kind).toBe('signal')

    // waitingFor persisted on the run state for the pull-discovery channel.
    const runState = await store.getRunState(runId)
    expect(runState?.status).toBe('paused')
    expect(runState?.waitingFor?.signalName).toBe('webhook-received')
    expect(runState?.waitingFor?.meta).toEqual({ source: 'stripe' })
  })

  it('delivers the signal payload as the value of the yield (in-memory resume)', async () => {
    const wf = defineWorkflow({
      name: 'signal-passthrough',
      input: z.object({}).default({}),
      output: z.object({ payload: z.any() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        const payload = yield* waitForSignal<{ ok: boolean; n: number }>(
          'thing',
        )
        return { payload }
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

    const phase2 = await collect(
      runWorkflow({
        workflow: wf as any,
        runId,
        signalDelivery: {
          signalId: 'sig-1',
          payload: { ok: true, n: 42 },
        },
        runStore: store,
      }),
    )

    const finished = phase2.find((e) => e.type === 'RUN_FINISHED') as unknown as
      | { output: { payload: { ok: boolean; n: number } } }
      | undefined
    expect(finished?.output.payload).toEqual({ ok: true, n: 42 })
  })

  it('delivers the same payload via the replay path after a process restart', async () => {
    const wf = defineWorkflow({
      name: 'signal-replay',
      input: z.object({}).default({}),
      output: z.object({ payload: z.any() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        const payload = yield* waitForSignal<{ ok: boolean }>('thing')
        return { payload }
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

    // Force replay path.
    ;(store as unknown as { getLive: (id: string) => undefined }).getLive = (
      _id,
    ) => undefined

    const phase2 = await collect(
      runWorkflow({
        workflow: wf as any,
        runId,
        signalDelivery: {
          signalId: 'sig-1',
          payload: { ok: true },
        },
        runStore: store,
      }),
    )

    const finished = phase2.find((e) => e.type === 'RUN_FINISHED') as unknown as
      | { output: { payload: { ok: boolean } } }
      | undefined
    expect(finished?.output.payload).toEqual({ ok: true })
  })
})

describe('sleep() / sleepUntil()', () => {
  it('pauses on the __timer signal with the deadline plumbed through', async () => {
    const wakeAt = Date.now() + 60_000

    const wf = defineWorkflow({
      name: 'sleep-until',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* sleepUntil(wakeAt)
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

    const runState = await store.getRunState(runId)
    expect(runState?.waitingFor?.signalName).toBe(TIMER_SIGNAL_NAME)
    expect(runState?.waitingFor?.deadline).toBe(wakeAt)

    const paused = phase1.find(
      (e) =>
        e.type === 'CUSTOM' && (e as { name?: string }).name === 'run.paused',
    ) as
      | { value: { signalName: string; deadline: number; kind: string } }
      | undefined
    expect(paused?.value.kind).toBe('sleep')
    expect(paused?.value.deadline).toBe(wakeAt)
  })

  it('resumes when the host delivers a __timer signal (no payload)', async () => {
    const wf = defineWorkflow({
      name: 'sleep-then-done',
      input: z.object({}).default({}),
      output: z.object({ awoke: z.boolean() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* sleep(60_000)
        return { awoke: true }
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

    const phase2 = await collect(
      runWorkflow({
        workflow: wf as any,
        runId,
        signalDelivery: {
          signalId: 'wake-1',
          payload: undefined,
        },
        runStore: store,
      }),
    )

    const finished = phase2.find((e) => e.type === 'RUN_FINISHED') as unknown as
      | { output: { awoke: boolean } }
      | undefined
    expect(finished?.output.awoke).toBe(true)
  })
})
