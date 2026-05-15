/**
 * Tests for the Temporal-style `patched()` migration flag (follow-up).
 *
 *   - `patched(name)` returns true when the workflow declared the
 *     patch at start time, false otherwise.
 *   - Workflows with `patches` declared switch to patch-versioned
 *     fingerprint mode: code-body changes don't trigger
 *     workflow_version_mismatch on resume.
 *   - Adding a patch across a deploy doesn't break in-flight runs;
 *     the old runs see `patched()` return false for the new patch.
 *   - Removing a patch is rejected with workflow_patches_removed.
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
        workflow: wf as any,
        input: {},
        runStore: store,
      }),
    )
    const finished = events.find((e) => e.type === 'RUN_FINISHED') as unknown as
      | { output: { flag: boolean } }
      | undefined
    expect(finished?.output.flag).toBe(true)
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
        workflow: wf as any,
        input: {},
        runStore: store,
      }),
    )
    const finished = events.find((e) => e.type === 'RUN_FINISHED') as unknown as
      | { output: { flag: boolean } }
      | undefined
    expect(finished?.output.flag).toBe(false)
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
        workflow: v1 as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(phase1)

    // Force replay path (simulate deploy across the pause).
    ;(store as unknown as { getLive: (id: string) => undefined }).getLive = (
      _id,
    ) => undefined

    // Phase 2: resume under v2. v1 run sees `patched('add-cache')`
    // return false; the old code path runs.
    const phase2 = await collect(
      runWorkflow({
        workflow: v2 as any,
        runId,
        approval: { approvalId: 'a1', approved: true },
        runStore: store,
      }),
    )

    const finished = phase2.find(
      (e) => e.type === 'RUN_FINISHED',
    ) as unknown as { output: { usedCache: boolean } } | undefined
    expect(finished?.output.usedCache).toBe(false)
  })

  it('refuses resume when patches were REMOVED across the deploy', async () => {
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
        workflow: oldWf as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(phase1)
    ;(store as unknown as { getLive: (id: string) => undefined }).getLive = (
      _id,
    ) => undefined

    const phase2 = await collect(
      runWorkflow({
        workflow: newWf as any,
        runId,
        approval: { approvalId: 'a1', approved: true },
        runStore: store,
      }),
    )

    const err = phase2.find((e) => e.type === 'RUN_ERROR') as
      | { code?: string }
      | undefined
    expect(err?.code).toBe('workflow_patches_removed')
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
        workflow: v1 as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(phase1)
    ;(store as unknown as { getLive: (id: string) => undefined }).getLive = (
      _id,
    ) => undefined

    const phase2 = await collect(
      runWorkflow({
        workflow: v2 as any,
        runId,
        approval: { approvalId: 'a1', approved: true },
        runStore: store,
      }),
    )

    expect(phase2.map((e) => e.type)).toContain('RUN_FINISHED')
    expect(phase2.find((e) => e.type === 'RUN_ERROR')).toBeUndefined()
  })
})
