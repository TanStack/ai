/**
 * Tests for the publisher hook (step 7 of the durability roadmap). The
 * hook is the host's seam for fanning out engine events to subscribers
 * on other nodes (Redis pub/sub, NATS, EventBridge, etc.). Library
 * contract: every event emitted by the engine is passed to `publish`
 * before being yielded to the SSE consumer; errors from `publish` are
 * caught and never break the run.
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

async function drain(iter: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const _ of iter) {
    // Drain — the publisher hook is the side-effect we're observing.
  }
}

describe('publisher hook', () => {
  it('receives every event the engine yields, with the run id', async () => {
    const echo = defineAgent({
      name: 'echo',
      input: z.object({ msg: z.string() }),
      output: z.object({ echoed: z.string() }),
      run: async ({ input }) => ({ echoed: input.msg.toUpperCase() }),
    })

    const wf = defineWorkflow({
      name: 'publish-wf',
      input: z.object({ msg: z.string() }),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: { echo },
      run: async function* ({ input, agents }) {
        yield* agents.echo({ msg: input.msg })
        return {}
      },
    })

    const seen: Array<{ runId: string; type: string }> = []
    const store = inMemoryRunStore()
    await drain(
      runWorkflow({
        workflow: wf as any,
        input: { msg: 'hi' },
        runStore: store,
        publish: (runId, event) => {
          seen.push({ runId, type: event.type })
        },
      }),
    )

    const types = seen.map((s) => s.type)
    expect(types).toContain('RUN_STARTED')
    expect(types).toContain('STATE_SNAPSHOT')
    expect(types).toContain('STEP_STARTED')
    expect(types).toContain('STEP_FINISHED')
    expect(types).toContain('RUN_FINISHED')

    // All entries share a stable runId (the one assigned at start).
    const runIds = new Set(seen.map((s) => s.runId))
    expect(runIds.size).toBe(1)
    const onlyRunId = [...runIds][0]!
    expect(onlyRunId).toMatch(/^run_/)
  })

  it('swallows publisher errors so the run is not broken', async () => {
    const wf = defineWorkflow({
      name: 'publish-throws',
      input: z.object({}).default({}),
      output: z.object({ ok: z.boolean() }),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        return { ok: true }
      },
    })

    const store = inMemoryRunStore()
    const events: Array<StreamChunk> = []
    for await (const e of runWorkflow({
      workflow: wf as any,
      input: {},
      runStore: store,
      publish: () => {
        throw new Error('publisher offline')
      },
    })) {
      events.push(e)
    }

    // Run still completes — the throwing publisher must not prevent
    // the SSE consumer from receiving the lifecycle events.
    expect(events.map((e) => e.type)).toContain('RUN_FINISHED')
  })

  it('forwards run.paused so an out-of-process subscriber can register a wake', async () => {
    const wf = defineWorkflow({
      name: 'publish-pause',
      input: z.object({}).default({}),
      output: z.object({}).default({}),
      state: z.object({}).default({}),
      agents: {},
      run: async function* () {
        yield* waitForSignal('webhook')
        return {}
      },
    })

    const store = inMemoryRunStore()
    const customEvents: Array<{ name: string; value: unknown }> = []
    await drain(
      runWorkflow({
        workflow: wf as any,
        input: {},
        runStore: store,
        publish: (_runId, event) => {
          if (event.type === 'CUSTOM') {
            customEvents.push({
              name: (event as { name: string }).name,
              value: (event as { value: unknown }).value,
            })
          }
        },
      }),
    )

    // The run.paused event reaches the publisher even though the SSE
    // stream ended at the same moment — both consumers learn of the
    // pause from the same emission point.
    const paused = customEvents.find((e) => e.name === 'run.paused')
    expect(paused).toBeDefined()
    expect((paused!.value as { signalName: string }).signalName).toBe('webhook')
  })
})
