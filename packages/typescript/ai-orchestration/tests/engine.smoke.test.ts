import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  approve,
  defineAgent,
  defineWorkflow,
  inMemoryRunStore,
  runWorkflow,
} from '../src'
import { collect, findRunId } from './test-utils'

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

    const events = await collect(
      runWorkflow({
        workflow: wf,
        input: { msg: 'hello' },
        runStore: inMemoryRunStore(),
      }),
    )

    const types = events.map((e) => e.type)
    expect(types).toContain('RUN_STARTED')
    expect(types).toContain('STATE_SNAPSHOT')
    expect(types).toContain('STEP_STARTED')
    expect(types).toContain('STEP_FINISHED')
    expect(types).toContain('RUN_FINISHED')

    expect(events.find((e) => e.type === 'STEP_FINISHED')).toMatchObject({
      content: { echoed: 'HELLO' },
    })
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

    const events = await collect(
      runWorkflow({
        workflow: wf,
        input: {},
        runStore: inMemoryRunStore(),
      }),
    )

    const delta = events.find((e) => e.type === 'STATE_DELTA')
    expect(delta).toMatchObject({
      delta: expect.arrayContaining([
        expect.objectContaining({
          op: 'replace',
          path: '/counter',
          value: 42,
        }),
      ]),
    })
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
    const events = await collect(
      runWorkflow({
        workflow: wf,
        input: {},
        runStore: store,
      }),
    )

    const types = events.map((e) => e.type)
    expect(types).toContain('STEP_STARTED')
    expect(
      events.some(
        (e) =>
          e.type === 'CUSTOM' &&
          // CUSTOM-chunk variant carries `name` at runtime; the static union
          // doesn't surface it, so we narrow per-occurrence.
          (e as { name?: string }).name === 'approval-requested',
      ),
    ).toBe(true)
    // Stream ended at the approval pause.
    expect(types).not.toContain('RUN_FINISHED')

    // Verify the persisted RunState reflects the paused approval.
    const runId = findRunId(events)
    const runState = await store.getRunState(runId)
    expect(runState).toMatchObject({
      status: 'paused',
      pendingApproval: { title: 'go?' },
    })
  })

  it('propagates a pre-aborted external signal to the agent run', async () => {
    // Per the addEventListener('abort', ...) contract, listeners don't
    // fire for the already-aborted state. The engine has to check the
    // signal explicitly at start; otherwise the agent's `run({ signal })`
    // sees a fresh, non-aborted signal even though the caller cancelled.
    let observedAborted: boolean | null = null
    const observer = defineAgent({
      name: 'observer',
      input: z.object({}).default({}),
      output: z.object({ ok: z.boolean() }),
      run: async ({ signal }) => {
        observedAborted = signal.aborted
        return { ok: true }
      },
    })

    const wf = defineWorkflow({
      name: 'pre-aborted',
      input: z.object({}).default({}),
      output: z.object({ ok: z.boolean() }),
      state: z.object({}).default({}),
      agents: { observer },
      run: async function* ({ agents }) {
        return yield* agents.observer({})
      },
    })

    const ac = new AbortController()
    ac.abort()
    await collect(
      runWorkflow({
        workflow: wf,
        input: {},
        runStore: inMemoryRunStore(),
        signal: ac.signal,
      }),
    )
    // Without the eager-abort check, observedAborted would be false here —
    // addEventListener never fires for an already-aborted signal.
    expect(observedAborted).toBe(true)
  })

  it('emits unique step ids for repeated agent calls inside nested workflows', async () => {
    const coder = defineAgent({
      name: 'coder',
      input: z.object({ filename: z.string() }),
      output: z.object({ filename: z.string() }),
      run: async ({ input }) => ({ filename: input.filename }),
    })

    const child = defineWorkflow({
      name: 'child',
      input: z.object({ files: z.array(z.string()) }),
      output: z.object({
        patches: z.array(z.object({ filename: z.string() })),
      }),
      state: z.object({}).default({}),
      agents: { coder },
      run: async function* ({ input, agents }) {
        const patches = []
        for (const filename of input.files) {
          patches.push(yield* agents.coder({ filename }))
        }
        return { patches }
      },
    })

    const parent = defineWorkflow({
      name: 'parent',
      input: z.object({ files: z.array(z.string()) }),
      output: z.object({
        patches: z.array(z.object({ filename: z.string() })),
      }),
      state: z.object({}).default({}),
      agents: { child },
      run: async function* ({ input, agents }) {
        return yield* agents.child({ files: input.files })
      },
    })

    const events = await collect(
      runWorkflow({
        workflow: parent,
        input: { files: ['server.ts', 'routes/metrics.ts', 'middleware.ts'] },
        runStore: inMemoryRunStore(),
      }),
    )

    const coderStarts = events.filter(
      (e) => e.type === 'STEP_STARTED' && e.stepName === 'coder',
    )
    const coderFinishes = events.filter(
      (e) => e.type === 'STEP_FINISHED' && e.stepName === 'coder',
    )

    expect(coderStarts).toHaveLength(3)
    expect(new Set(coderStarts.map((e) => e.stepId)).size).toBe(3)
    expect(coderStarts.map((e) => e.stepName)).toEqual([
      'coder',
      'coder',
      'coder',
    ])
    expect(coderFinishes.map((e) => e.content)).toEqual([
      { filename: 'server.ts' },
      { filename: 'routes/metrics.ts' },
      { filename: 'middleware.ts' },
    ])
  })
})
