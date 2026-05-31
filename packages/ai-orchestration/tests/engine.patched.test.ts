/**
 * Tests for the Temporal-style `patched()` migration flag (follow-up).
 *
 *   - `patched(name)` returns true when the workflow declared the
 *     patch at start time, false otherwise.
 *   - `patched()` decisions are delegated to workflow-core step
 *     checkpoints.
 *   - Adding a patch across a deploy doesn't break in-flight runs;
 *     the old runs see `patched()` return false for the new patch.
 *   - Patch removal is not reimplemented in the AI wrapper; hosts that
 *     need strict migration routing should use explicit workflow versions.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  approve,
  defineWorkflow,
  inMemoryRunStore,
  patched,
  runWorkflow,
} from '../src'
import {
  collect,
  findApprovalId,
  findRunId,
  simulateRestart,
} from './test-utils'

describe('patched()', () => {
  it('returns true when the workflow declares the patch', async () => {
    const wf = defineWorkflow({
      name: 'patch-on',
      input: z.object({}).default({}),
      output: z.object({ flag: z.boolean() }),
      state: z.object({}).default({}),
      patches: ['add-cache'],
      agents: {},
      run: async function* () {
        const flag = yield* patched('add-cache')
        return { flag }
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
      output: { flag: true },
    })
  })

  it('returns false when the workflow does not declare the patch', async () => {
    const wf = defineWorkflow({
      name: 'patch-absent',
      input: z.object({}).default({}),
      output: z.object({ flag: z.boolean() }),
      state: z.object({}).default({}),
      patches: ['something-else'],
      agents: {},
      run: async function* () {
        const flag = yield* patched('not-declared')
        return { flag }
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
      output: { flag: false },
    })
  })

  it('keeps the old behavior for runs started before the patch was added', async () => {
    // The migration scenario: v1 declared no 'add-cache' patch (or
    // declared an older patches list). v2 declares ['add-cache']. An
    // in-flight v1 run resumes under v2 code. The v1 run's
    // startingPatches doesn't contain 'add-cache' so the old code
    // path runs.
    const v1 = defineWorkflow({
      name: 'migrating-wf',
      input: z.object({}).default({}),
      output: z.object({ usedCache: z.boolean() }),
      state: z.object({}).default({}),
      patches: [], // no patches at v1
      agents: {},
      run: async function* () {
        const useCache = yield* patched('add-cache')
        yield* approve({ title: 'go?' })
        return { usedCache: useCache }
      },
    })

    const v2 = defineWorkflow({
      name: 'migrating-wf',
      input: z.object({}).default({}),
      output: z.object({ usedCache: z.boolean() }),
      state: z.object({}).default({}),
      patches: ['add-cache'],
      agents: {},
      run: async function* () {
        const useCache = yield* patched('add-cache')
        yield* approve({ title: 'go?' })
        return { usedCache: useCache }
      },
    })

    const store = inMemoryRunStore()

    // Phase 1: start under v1.
    const phase1 = await collect(
      runWorkflow({
        workflow: v1,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(phase1)
    const approvalId = findApprovalId(phase1)

    // Force replay path (simulate deploy across the pause).
    simulateRestart(store)

    // Phase 2: resume under v2. v1 run sees `patched('add-cache')`
    // return false; the old code path runs.
    const phase2 = await collect(
      runWorkflow({
        workflow: v2,
        runId,
        approval: { approvalId, approved: true },
        runStore: store,
      }),
    )

    expect(phase2.find((e) => e.type === 'RUN_FINISHED')).toMatchObject({
      output: { usedCache: false },
    })
  })

  it('does not add an AI-side removed-patch guard on top of workflow-core', async () => {
    const oldWf = defineWorkflow({
      name: 'remove-patch',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      patches: ['legacy-handling'],
      agents: {},
      run: async function* () {
        yield* approve({ title: 'go?' })
        return {}
      },
    })
    const newWf = defineWorkflow({
      name: 'remove-patch',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      patches: [], // removed
      agents: {},
      run: async function* () {
        yield* approve({ title: 'go?' })
        return {}
      },
    })

    const store = inMemoryRunStore()
    const phase1 = await collect(
      runWorkflow({
        workflow: oldWf,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(phase1)
    const approvalId = findApprovalId(phase1)
    simulateRestart(store)

    const phase2 = await collect(
      runWorkflow({
        workflow: newWf,
        runId,
        approval: { approvalId, approved: true },
        runStore: store,
      }),
    )

    expect(phase2.find((e) => e.type === 'RUN_ERROR')).toBeUndefined()
    expect(phase2.map((e) => e.type)).toContain('RUN_FINISHED')
  })

  it('allows resume when code body changed but patches list is unchanged', async () => {
    // The whole point: patch-versioned mode tolerates body churn.
    const v1 = defineWorkflow({
      name: 'body-changes',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      patches: ['stable'],
      agents: {},
      run: async function* () {
        yield* approve({ title: 'go?' })
        return {}
      },
    })
    const v2 = defineWorkflow({
      name: 'body-changes',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      patches: ['stable'],
      agents: {},
      run: async function* () {
        // body differs from v1, but same shape and same patches list
        const x = 1
        void x
        yield* approve({ title: 'go?' })
        return {}
      },
    })

    const store = inMemoryRunStore()
    const phase1 = await collect(
      runWorkflow({
        workflow: v1,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(phase1)
    const approvalId = findApprovalId(phase1)
    simulateRestart(store)

    const phase2 = await collect(
      runWorkflow({
        workflow: v2,
        runId,
        approval: { approvalId, approved: true },
        runStore: store,
      }),
    )

    expect(phase2.map((e) => e.type)).toContain('RUN_FINISHED')
    expect(phase2.find((e) => e.type === 'RUN_ERROR')).toBeUndefined()
  })
})
