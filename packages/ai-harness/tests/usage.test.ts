import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import { emptySharedLogState, foldLogEntry, sessionOf } from '../src/log'
import { addUsage, emptyUsage } from '../src/usage'
import { mockAdapter, text, toolCall } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { SessionEvent } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })
const alice = { id: 'alice' }
const bob = { id: 'bob' }

/** `chunks` with this usage on RUN_FINISHED, as a provider reports it. */
function withUsage(
  chunks: Array<StreamChunk>,
  usage: { prompt: number; completion: number; cost?: number },
): Array<StreamChunk> {
  return chunks.map((chunk) =>
    chunk.type === EventType.RUN_FINISHED
      ? {
          ...chunk,
          usage: {
            promptTokens: usage.prompt,
            completionTokens: usage.completion,
            totalTokens: usage.prompt + usage.completion,
            ...(usage.cost !== undefined ? { cost: usage.cost } : {}),
          },
        }
      : chunk,
  )
}

/** A mock model with its own model id, so totals can be told apart. */
function model(id: string, replies: Array<Reply>) {
  const { adapter, calls } = mockAdapter(replies)
  return { adapter: { ...adapter, model: id }, calls }
}

const lookup = toolDefinition({
  name: 'lookup',
  description: 'Look something up',
  inputSchema: z.object({}),
}).server(async () => ({ found: true }))

/** A model call that uses `lookup`, then one that answers. */
const lookupThenAnswer = (cost?: [number, number]): Array<Reply> => [
  () =>
    withUsage(toolCall('lookup', {}), {
      prompt: 10,
      completion: 5,
      ...(cost ? { cost: cost[0] } : {}),
    }),
  () =>
    withUsage(text('done'), {
      prompt: 20,
      completion: 10,
      ...(cost ? { cost: cost[1] } : {}),
    }),
]

const usageEvents = (events: Array<SessionEvent>) =>
  events.filter(
    (entry) =>
      entry.event.type === EventType.CUSTOM &&
      entry.event.name === 'harness.usage',
  )

async function readEvents(session: {
  events: (options?: { signal?: AbortSignal }) => AsyncIterable<SessionEvent>
}) {
  const seen: Array<SessionEvent> = []
  const reader = new AbortController()
  const done = (async () => {
    for await (const entry of session.events({ signal: reader.signal }))
      seen.push(entry)
  })()
  return {
    seen,
    stop: async () => {
      reader.abort()
      await done.catch(() => {})
    },
  }
}

describe('session usage totals', () => {
  it('adds every model call of a turn, by model and by sender, with the reported cost', async () => {
    const main = model('main-model', lookupThenAnswer([0.01, 0.02]))
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/usage',
        adapter: main.adapter,
        tools: [lookup],
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )
    const events = await readEvents(session)

    const turn = session.send('Find it.')
    await turn

    const usage = session.usage()
    expect(usage.total).toMatchObject({
      calls: 2,
      promptTokens: 30,
      completionTokens: 15,
      totalTokens: 45,
    })
    expect(usage.total.cost).toBeCloseTo(0.03)
    expect(Object.keys(usage.byModel)).toEqual(['mock/main-model'])
    expect(usage.byModel['mock/main-model']).toEqual(usage.total)
    expect(usage.bySender).toEqual({ alice: usage.total })
    expect(session.snapshot().usage).toEqual(usage)

    await events.stop()
    const published = usageEvents(events.seen)
    expect(published).toHaveLength(2)
    expect(published.every((entry) => entry.operationId === turn.id)).toBe(true)
    expect(published.at(-1)?.event).toMatchObject({
      value: {
        model: 'mock/main-model',
        sender: 'alice',
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        total: { calls: 2, totalTokens: 45 },
      },
    })
    await host.close()
  })

  it('keeps one total for each sender, and has no cost when no call reported one', async () => {
    const main = model('main-model', [
      () => withUsage(text('for alice'), { prompt: 4, completion: 1 }),
      () => withUsage(text('for bob'), { prompt: 8, completion: 2 }),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/usage-senders',
        adapter: main.adapter,
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    await session.send('Hi.')
    await session.send('Hello.', { user: bob })

    const usage = session.usage()
    expect(usage.total).toEqual({
      calls: 2,
      promptTokens: 12,
      completionTokens: 3,
      totalTokens: 15,
      cachedTokens: 0,
      cacheWriteTokens: 0,
    })
    expect(usage.bySender.alice?.totalTokens).toBe(5)
    expect(usage.bySender.bob?.totalTokens).toBe(10)
    await host.close()
  })

  it('adds the model calls of a subagent and of a background agent', async () => {
    const helperModel = model('helper-model', [
      () => withUsage(text('helped'), { prompt: 5, completion: 2 }),
    ])
    const workerModel = model('worker-model', [
      () => withUsage(text('worked'), { prompt: 6, completion: 3 }),
    ])
    const lead = model('lead-model', [
      () => withUsage(toolCall('helper', {}), { prompt: 1, completion: 1 }),
      () => withUsage(text('lead done'), { prompt: 2, completion: 1 }),
    ])
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      run: (ctx) => ctx.chat({ adapter: helperModel.adapter }),
    })
    const worker = defineAgent({
      name: 'worker',
      description: 'Works',
      run: (ctx) => ctx.chat({ adapter: workerModel.adapter }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/usage-agents',
        adapter: lead.adapter,
        subagents: { agents: [helper] },
        agents: [worker],
      }),
      {
        threadId: THREAD,
        user: alice,
      },
    )

    expect((await session.send('Get help.')).text).toBe('lead done')
    expect(await session.agent('worker')?.start()).toBe('worked')

    const usage = session.usage()
    expect(usage.byModel['mock/lead-model']?.totalTokens).toBe(5)
    expect(usage.byModel['mock/helper-model']?.totalTokens).toBe(7)
    expect(usage.byModel['mock/worker-model']?.totalTokens).toBe(9)
    expect(usage.total).toMatchObject({ calls: 4, totalTokens: 21 })
    expect(usage.bySender.alice?.totalTokens).toBe(21)
    await host.close()
  })
})

describe('usage totals after a restart', () => {
  it('keeps the totals in the log', async () => {
    const { metadata } = memoryPersistence().stores
    const log = memoryLogStore()
    const persistence = { stores: { log, metadata } }
    const first = model('main-model', lookupThenAnswer([0.01, 0.02]))
    const harness = (adapter: typeof first.adapter) =>
      defineHarness({ name: 'test/usage-durable', adapter, tools: [lookup] })
    const host = createHarnessHost({ persistence })
    const session = await host.open(harness(first.adapter), {
      threadId: THREAD,
      user: alice,
    })
    await session.send('Find it.')
    const before = session.usage()
    await host.close()

    const records = (await log.read({ logId: LOG })).filter(
      (entry) => entry.record.type === 'harness.usage',
    )
    expect(records).toHaveLength(2)

    const next = createHarnessHost({ persistence })
    const reopened = await next.open(harness(model('main-model', []).adapter), {
      threadId: THREAD,
      user: alice,
    })
    expect(reopened.usage()).toEqual(before)
    expect(reopened.usage().total.totalTokens).toBe(45)
    await next.close()
  })
})

describe('usage of each run', () => {
  it('names the run of each call, adds a child call to its parent, and drops the sum when the run ends', async () => {
    const workerModel = model('worker-model', [
      () => withUsage(text('worked'), { prompt: 6, completion: 3 }),
    ])
    const worker = defineAgent({
      name: 'worker',
      description: 'Works',
      run: (ctx) => ctx.chat({ adapter: workerModel.adapter }),
    })
    const lead = defineAgent({
      name: 'lead',
      description: 'Runs the worker',
      run: async (ctx) => ctx.harness!.agents.run(worker),
    })
    const { metadata } = memoryPersistence().stores
    const log = memoryLogStore()
    const host = createHarnessHost({
      persistence: { stores: { log, metadata } },
    })
    const session = await host.open(
      defineHarness({
        name: 'test/usage-runs',
        adapter: model('main-model', []).adapter,
        agents: [lead, worker],
      }),
      { threadId: THREAD, user: alice },
    )

    const run = session.agents.lead.start(undefined, { addResultNote: false })
    expect(await run).toBe('worked')
    const workerRun = session
      .agentRuns()
      .find((item) => item.agent === 'worker')

    const entries = await log.read({ logId: LOG })
    const usage = entries.filter(
      (entry) => entry.record.type === 'harness.usage',
    )
    expect(usage.map((entry) => entry.record.runId)).toEqual([workerRun?.runId])
    /** The run sums of the thread after the log up to `seq`. */
    const sumsAt = (seq: number) => {
      const state = emptySharedLogState()
      for (const entry of entries) {
        if (entry.seq <= seq) foldLogEntry(state, entry, { rootThread: THREAD })
      }
      return sessionOf(state, THREAD).runUsage
    }
    const afterCall = sumsAt(usage[0]?.seq ?? 0)
    expect(afterCall.get(workerRun?.runId ?? '')?.totalTokens).toBe(9)
    expect(afterCall.get(run.id)?.totalTokens).toBe(9)
    expect(sumsAt(Infinity).size).toBe(0)
    // The run record of each run keeps its final usage.
    const finalUsage = (runId: string) =>
      entries.find(
        (entry) =>
          entry.record.type === 'harness.run.update' &&
          entry.record.runId === runId &&
          isRecordWithUsage(entry.record.patch),
      )?.record.patch
    expect(finalUsage(run.id)).toMatchObject({ usage: { totalTokens: 9 } })
    expect(finalUsage(workerRun?.runId ?? '')).toMatchObject({
      usage: { totalTokens: 9 },
    })
    await host.close()
  })
})

/** Is `value` a run record change that sets `usage`? */
const isRecordWithUsage = (value: unknown) =>
  typeof value === 'object' && value !== null && 'usage' in value

describe('usage totals by source', () => {
  const counts = (totalTokens: number) => ({
    promptTokens: totalTokens,
    completionTokens: 0,
    totalTokens,
    cachedTokens: 0,
    cacheWriteTokens: 0,
  })

  it('adds a call with a source under it, and keeps a turn call out of bySource', () => {
    const totals = emptyUsage()

    addUsage(totals, { model: 'm', usage: counts(5) })
    addUsage(totals, {
      model: 'm',
      source: 'plugin:tanstack/title',
      label: 'title',
      usage: counts(2),
    })
    addUsage(totals, {
      model: 'm',
      source: 'plugin:tanstack/title',
      usage: counts(3),
    })
    addUsage(totals, {
      model: 'm',
      source: 'plugin:tanstack/goal',
      usage: counts(4),
    })

    expect(totals.total).toMatchObject({ calls: 4, totalTokens: 14 })
    expect(totals.bySource).toEqual({
      'plugin:tanstack/title': expect.objectContaining({
        calls: 2,
        totalTokens: 5,
      }),
      'plugin:tanstack/goal': expect.objectContaining({
        calls: 1,
        totalTokens: 4,
      }),
    })
  })
})

describe('usage totals of an odd key', () => {
  it('keeps a sender with the id __proto__ as its own entry', () => {
    const totals = emptyUsage()

    addUsage(totals, {
      model: 'm',
      user: { id: '__proto__' },
      usage: {
        promptTokens: 1,
        completionTokens: 2,
        totalTokens: 3,
        cachedTokens: 0,
        cacheWriteTokens: 0,
      },
    })

    expect(Object.keys(totals.bySender)).toEqual(['__proto__'])
    expect(JSON.stringify(totals.bySender)).toBe(
      JSON.stringify({ ['__proto__']: totals.total }),
    )
    expect(Object.hasOwn(Object.prototype, 'calls')).toBe(false)
  })
})
