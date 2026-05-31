/**
 * Tests for the `attach` entrypoint (step 6 of the durability roadmap).
 *
 * `runWorkflow({ runId, attach: true })` lets a fresh subscriber
 * (browser refresh, shared link, mobile reconnect) read the current
 * snapshot of an existing run without driving it forward. The wire
 * format must carry enough for the client to rebuild its step UI from
 * scratch: STATE_SNAPSHOT + the steps-snapshot CUSTOM event with
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
import { collect, findRunId } from './test-utils'

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
        workflow: wf,
        input: { msg: 'hi' },
        runStore: store,
      }),
    )
    const runId = findRunId(phase1)

    // Attach as if we were a fresh subscriber.
    const attached = await collect(
      runWorkflow({
        workflow: wf,
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
    // workflow-core persists run metadata and the event log. Mutable
    // user state is reconstructed during execution, so attach exposes
    // the initial state snapshot rather than the paused mutation.
    expect(stateSnap.snapshot.phase).toBe('start')

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
        workflow: wf,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(start)
    await collect(
      runWorkflow({
        workflow: wf,
        runId,
        signalDelivery: { signalId: 'g1', payload: undefined },
        runStore: store,
      }),
    )

    // workflow-core@0.0.2 retains terminal run logs, so attach replays
    // the final RUN_FINISHED with the persisted output. Hosts get
    // post-mortem attach for free; no archive hook is needed for the
    // common case.
    const attached = await collect(
      runWorkflow({
        workflow: wf,
        runId,
        attach: true,
        runStore: store,
      }),
    )

    expect(attached.find((e) => e.type === 'RUN_ERROR')).toBeUndefined()
    expect(attached.find((e) => e.type === 'RUN_FINISHED')).toMatchObject({
      output: { done: true },
    })
  })
})

describe('attach — paused on approval', () => {
  it('emits approval-requested so a refreshing client can populate pendingApproval', async () => {
    // Regression for the bug where attach to a paused-on-approval run
    // emitted only run.paused with signalName='__approval'. The client's
    // run.paused handler treats __approval as "already handled by
    // approval-requested above" — but the original SSE response that
    // emitted approval-requested was already closed. Without a re-emit
    // on attach, the refreshed UI shows no prompt to act on.
    const { approve } = await import('../src/primitives/approve')

    const wf = defineWorkflow({
      name: 'pause-on-approval',
      input: z.object({}).default({}),
      output: z.object({ ok: z.boolean() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        const d = yield* approve({
          title: 'publish?',
          description: 'release to prod',
        })
        return { ok: d.approved }
      },
    })

    const store = inMemoryRunStore()
    const start = await collect(
      runWorkflow({ workflow: wf, input: {}, runStore: store }),
    )
    const runId = findRunId(start)

    const attached = await collect(
      runWorkflow({ workflow: wf, runId, attach: true, runStore: store }),
    )

    // run.paused is emitted as before.
    const paused = attached.find(
      (e) =>
        e.type === 'CUSTOM' && (e as { name?: string }).name === 'run.paused',
    ) as { value?: { kind?: string; signalName?: string } } | undefined
    expect(paused?.value?.kind).toBe('approval')
    expect(paused?.value?.signalName).toBe('__approval')

    // AND approval-requested is now re-emitted on attach.
    const approvalRequested = attached.find(
      (e) =>
        e.type === 'CUSTOM' &&
        (e as { name?: string }).name === 'approval-requested',
    ) as { value?: { title?: string; description?: string } } | undefined
    expect(approvalRequested?.value?.title).toBe('publish?')
    expect(approvalRequested?.value?.description).toBe('release to prod')
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
        workflow: wf,
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
