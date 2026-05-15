import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  approve,
  defineAgent,
  defineWorkflow,
  inMemoryRunStore,
  runWorkflow,
} from '../src'

describe('engine smoke', () => {
  it('runs a single-agent workflow end-to-end', async () => {
    const echo = defineAgent({
      name: 'echo',
      input: z.object({ msg: z.string() }),
      output: z.object({ echoed: z.string() }),
      run: async ({ input }) => ({ echoed: input.msg.toUpperCase() }),
    })

    const wf = defineWorkflow({
      name: 'echo-wf',
      input: z.object({ msg: z.string() }),
      output: z.object({ echoed: z.string() }),
      state: z.object({}).default({}),
      agents: { echo },
      run: async function* ({ input, agents }) {
        const r = yield* agents.echo({ msg: input.msg })
        return r
      },
    })

    const events: Array<unknown> = []
    for await (const c of runWorkflow({
      workflow: wf as any,
      input: { msg: 'hello' },
      runStore: inMemoryRunStore(),
    })) {
      events.push(c)
    }

    const types = events.map((e) => (e as { type: string }).type)
    expect(types).toContain('RUN_STARTED')
    expect(types).toContain('STATE_SNAPSHOT')
    expect(types).toContain('STEP_STARTED')
    expect(types).toContain('STEP_FINISHED')
    expect(types).toContain('RUN_FINISHED')

    const stepFinished = events.find(
      (e) => (e as { type: string }).type === 'STEP_FINISHED',
    ) as { content: unknown }
    expect(stepFinished.content).toEqual({ echoed: 'HELLO' })
  })

  it('emits STATE_DELTA on state mutations between yields', async () => {
    const setter = defineAgent({
      name: 'setter',
      output: z.object({ val: z.number() }),
      run: async () => ({ val: 42 }),
    })

    const wf = defineWorkflow({
      name: 'state-wf',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({ counter: z.number().default(0) }),
      agents: { setter },
      run: async function* ({ state, agents }) {
        const r = yield* agents.setter({})
        state.counter = r.val
        return {}
      },
    })

    const events: Array<unknown> = []
    for await (const c of runWorkflow({
      workflow: wf as any,
      input: {},
      runStore: inMemoryRunStore(),
    })) {
      events.push(c)
    }

    const delta = events.find(
      (e) => (e as { type: string }).type === 'STATE_DELTA',
    ) as { delta: Array<{ op: string; path: string; value: unknown }> }
    expect(delta).toBeDefined()
    expect(delta.delta).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: 'replace',
          path: '/counter',
          value: 42,
        }),
      ]),
    )
  })

  it('pauses on approval — stream ends after approval-requested, RUN_FINISHED not emitted', async () => {
    const wf = defineWorkflow({
      name: 'approval-wf',
      input: z.object({}).default({}),
      output: z.object({ ok: z.boolean() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        const d = yield* approve({ title: 'go?' })
        return { ok: d.approved }
      },
    })

    const store = inMemoryRunStore()
    const events: Array<unknown> = []
    for await (const c of runWorkflow({
      workflow: wf as any,
      input: {},
      runStore: store,
    })) {
      events.push(c)
    }

    const types = events.map((e) => (e as { type: string }).type)
    expect(types).toContain('STEP_STARTED')
    expect(
      events.some(
        (e) =>
          (e as { type: string; name?: string }).type === 'CUSTOM' &&
          (e as { name?: string }).name === 'approval-requested',
      ),
    ).toBe(true)
    // Stream ended at the approval pause.
    expect(types).not.toContain('RUN_FINISHED')

    // The live generator should still be retrievable from the store for resume.
    // We don't inspect the live map directly (private); we verify the store
    // can serve a get() of the run state with status 'paused'.
    // Note: runId isn't returned to the test directly. Find from RUN_STARTED.
    const runStarted = events.find(
      (e) => (e as { type: string }).type === 'RUN_STARTED',
    ) as { runId: string }
    expect(runStarted.runId).toBeTruthy()
    const runState = await store.getRunState(runStarted.runId)
    expect(runState).toBeDefined()
    expect(runState!.status).toBe('paused')
    expect(runState!.pendingApproval?.title).toBe('go?')
  })
})
