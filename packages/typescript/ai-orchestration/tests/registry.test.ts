/**
 * Tests for the cross-version registry helpers (follow-up). Pins:
 *   - selectWorkflowVersion finds the version matching the run's
 *     persisted workflowVersion.
 *   - Unversioned legacy runs fall back to the version with no
 *     `version` declared.
 *   - createWorkflowRegistry rejects duplicate (name, version) pairs.
 *   - registry.forRun returns the default when no match is found.
 *   - A full round-trip: start under v1, deploy v2 alongside v1,
 *     resume the v1 run through the registry — v1 code runs.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  approve,
  createWorkflowRegistry,
  defineWorkflow,
  inMemoryRunStore,
  patched,
  runWorkflow,
  selectWorkflowVersion,
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

describe('selectWorkflowVersion', () => {
  it('returns the version matching the run`s persisted workflowVersion', async () => {
    const v1 = defineWorkflow({
      name: 'pipeline',
      version: 'v1',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* approve({ title: 'go?' })
        return {}
      },
    })
    const v2 = defineWorkflow({
      name: 'pipeline',
      version: 'v2',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* approve({ title: 'go?' })
        return {}
      },
    })

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: v1 as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(events)

    const matched = await selectWorkflowVersion([v1, v2], runId, store)
    expect(matched?.version).toBe('v1')
  })

  it('returns undefined when no version matches', async () => {
    const v1 = defineWorkflow({
      name: 'pipeline',
      version: 'v1',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* approve({ title: 'go?' })
        return {}
      },
    })

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: v1 as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(events)

    // Pass an empty array — no version matches.
    const matched = await selectWorkflowVersion([], runId, store)
    expect(matched).toBeUndefined()
  })

  it('falls back to an unversioned definition for legacy unversioned runs', async () => {
    // Define a workflow WITHOUT version to mimic pre-versioning runs.
    const legacy = defineWorkflow({
      name: 'pipeline',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* approve({ title: 'go?' })
        return {}
      },
    })
    const v2 = defineWorkflow({
      name: 'pipeline',
      version: 'v2',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* approve({ title: 'go?' })
        return {}
      },
    })

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: legacy as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(events)

    const matched = await selectWorkflowVersion([legacy, v2], runId, store)
    expect(matched).toBe(legacy)
  })
})

describe('createWorkflowRegistry', () => {
  const makeWf = (version: string) =>
    defineWorkflow({
      name: 'pipeline',
      version,
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* approve({ title: 'go?' })
        return {}
      },
    })

  it('rejects duplicate (name, version) pairs', () => {
    const reg = createWorkflowRegistry()
    const a = makeWf('v1')
    reg.add(a)
    expect(() => reg.add(a)).toThrow(/already registered/)
  })

  it('routes runs to the right version', async () => {
    const v1 = makeWf('v1')
    const v2 = makeWf('v2')
    const reg = createWorkflowRegistry({ default: v2 })
    reg.add(v1)
    reg.add(v2)

    const store = inMemoryRunStore()
    const events = await collect(
      runWorkflow({
        workflow: v1 as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(events)

    const routed = await reg.forRun(runId, store)
    expect(routed?.version).toBe('v1')
  })

  it('returns the registered default when no exact match is found', async () => {
    const v1 = makeWf('v1')
    const v3 = makeWf('v3')
    const reg = createWorkflowRegistry({ default: v3 })
    reg.add(v1)
    reg.add(v3)

    const store = inMemoryRunStore()
    // Make a run under v1, then later we'll lookup with only v3 in the
    // registry — should fall back to default.
    const events = await collect(
      runWorkflow({
        workflow: v1 as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(events)

    const regWithoutV1 = createWorkflowRegistry({ default: v3 })
    regWithoutV1.add(v3)
    const routed = await regWithoutV1.forRun(runId, store)
    expect(routed?.version).toBe('v3')
  })

  it('end-to-end: start under v1, deploy v2 alongside, resume routes to v1', async () => {
    // The real migration scenario. v1 is in flight; we deploy v2; an
    // in-flight v1 run resumes via the registry and runs v1's code.
    const v1 = defineWorkflow({
      name: 'migrating',
      version: 'v1',
      patches: [], // patch-versioned mode so cross-version resume is allowed
      input: z.object({}).default({}),
      output: z.object({ version: z.string() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        // v1 doesn't have the patch
        const onV2 = yield* patched('on-v2')
        yield* approve({ title: 'go?' })
        return { version: onV2 ? 'v2-via-patch' : 'v1-via-routing' }
      },
    })
    const v2 = defineWorkflow({
      name: 'migrating',
      version: 'v2',
      patches: ['on-v2'],
      input: z.object({}).default({}),
      output: z.object({ version: z.string() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        const onV2 = yield* patched('on-v2')
        yield* approve({ title: 'go?' })
        return { version: onV2 ? 'v2-via-patch' : 'v1-via-routing' }
      },
    })

    const reg = createWorkflowRegistry({ default: v2 })
    reg.add(v1)
    reg.add(v2)

    const store = inMemoryRunStore()
    const phase1 = await collect(
      runWorkflow({
        workflow: v1 as any,
        input: {},
        runStore: store,
      }),
    )
    const runId = findRunId(phase1)

    // Simulate the deploy that drops the live handle.
    ;(store as unknown as { getLive: (id: string) => undefined }).getLive = (
      _id,
    ) => undefined

    // Resume via the registry — should route to v1.
    const routed = await reg.forRun(runId, store)
    expect(routed?.version).toBe('v1')

    const phase2 = await collect(
      runWorkflow({
        workflow: routed as any,
        runId,
        approval: { approvalId: 'a1', approved: true },
        runStore: store,
      }),
    )
    const finished = phase2.find(
      (e) => e.type === 'RUN_FINISHED',
    ) as unknown as { output: { version: string } } | undefined
    expect(finished?.output.version).toBe('v1-via-routing')
  })
})
