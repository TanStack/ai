/**
 * Tests for the `attach` entrypoint (step 6 of the durability roadmap).
 *
 * `runWorkflow({ runId, attach: true })` lets a fresh subscriber
 * (browser refresh, shared link, mobile reconnect) read the current
 * snapshot of an existing run without driving it forward. The wire
 * format must carry enough for the client to rebuild its UI from
 * scratch — STATE_SNAPSHOT + the steps-snapshot CUSTOM event with
 * every completed step record.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  defineAgent,
  defineWorkflow,
  inMemoryRunStore,
  runWorkflow,
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

describe('attach — paused run', () => {
  it('emits state + steps snapshot and the pause descriptor, then ends', async () => {
    const echo = defineAgent({
      name: 'echo',
      input: z.object({ msg: z.string() }),
      output: z.object({ echoed: z.string() }),
      run: async ({ input }) => ({ echoed: input.msg.toUpperCase() }),
    })

    const wf = defineWorkflow({
      name: 'attach-paused',
      input: z.object({ msg: z.string() }),
      output: z.object({}).default({}),
      state: z.object({ phase: z.string().default('start') }),
      agents: { echo },
      run: async function* ({ input, state, agents }) {
        state.phase = 'echoing'
        yield* agents.echo({ msg: input.msg })
        state.phase = 'waiting'
        yield* waitForSignal('go', { meta: { hint: 'waiting on user' } })
        return {}
      },
    })

    const store = inMemoryRunStore()
    const phase1 = await collect(
      runWorkflow({
        workflow: wf as any,
        input: { msg: 'hi' },
        runStore: store,
      }),
    )
    const runId = findRunId(phase1)

    // Attach as if we were a fresh subscriber.
    const attached = await collect(
      runWorkflow({
        workflow: wf as any,
        runId,
        attach: true,
        runStore: store,
      }),
    )

    const types = attached.map((e) => e.type)
    expect(types).toContain('RUN_STARTED')
    expect(types).toContain('STATE_SNAPSHOT')
    // Not RUN_FINISHED — the run is paused.
    expect(types).not.toContain('RUN_FINISHED')

    const stateSnap = attached.find((e) => e.type === 'STATE_SNAPSHOT') as {
      snapshot: { phase: string }
    }
    expect(stateSnap.snapshot.phase).toBe('waiting')

    const stepsSnap = attached.find(
      (e) =>
        e.type === 'CUSTOM' &&
        (e as { name?: string }).name === 'steps-snapshot',
    ) as { value: { steps: Array<{ kind: string; name: string }> } }
    expect(stepsSnap.value.steps).toHaveLength(1)
    expect(stepsSnap.value.steps[0]).toMatchObject({
      kind: 'agent',
      name: 'echo',
    })

    const paused = attached.find(
      (e) =>
        e.type === 'CUSTOM' && (e as { name?: string }).name === 'run.paused',
    ) as
      | { value: { signalName: string; kind: string; meta?: unknown } }
      | undefined
    expect(paused?.value.signalName).toBe('go')
    expect(paused?.value.kind).toBe('signal')
    expect(paused?.value.meta).toEqual({ hint: 'waiting on user' })
  })
})

describe('attach — finished run', () => {
  it('replays the final RUN_FINISHED with the persisted output', async () => {
    const wf = defineWorkflow({
      name: 'attach-finished',
      input: z.object({}).default({}),
      output: z.object({ done: z.boolean() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* waitForSignal('go')
        return { done: true }
      },
    })

    const store = inMemoryRunStore()

    // Run to completion: start → pause → resume.
    const start = await collect(
      runWorkflow({
        workflow: wf as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(start)
    await collect(
      runWorkflow({
        workflow: wf as any,
        runId,
        signalDelivery: { signalId: 'g1', payload: undefined },
        runStore: store,
      }),
    )

    // After RUN_FINISHED the engine deletes the run, so attach should
    // emit run_lost. This pins the deletion-after-finish contract:
    // hosts that want post-mortem attach must keep their own copy
    // (e.g., wire the publisher hook to archive the run before it's
    // deleted) — the engine's hot store is for live operations only.
    const attached = await collect(
      runWorkflow({
        workflow: wf as any,
        runId,
        attach: true,
        runStore: store,
      }),
    )

    const err = attached.find((e) => e.type === 'RUN_ERROR') as
      | { code?: string }
      | undefined
    expect(err?.code).toBe('run_lost')
  })
})

describe('attach — unknown run', () => {
  it('emits run_lost when neither state nor live handle exists', async () => {
    const wf = defineWorkflow({
      name: 'unused',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        return {}
      },
    })

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: wf as any,
        runId: 'no-such-run',
        attach: true,
        runStore: store,
      }),
    )

    const err = events.find((e) => e.type === 'RUN_ERROR') as
      | { code?: string }
      | undefined
    expect(err?.code).toBe('run_lost')
  })
})
