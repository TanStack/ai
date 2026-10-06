import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { mockAdapter, text, toolCall } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { SessionEvent } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'
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
      { threadId: THREAD, principal: alice },
    )
    const events = await readEvents(session)

    const turn = session.prompt('Find it.')
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
      defineHarness({ name: 'test/usage-senders', adapter: main.adapter }),
      { threadId: THREAD, principal: alice },
    )

    await session.prompt('Hi.')
    await session.prompt('Hello.', { principal: bob })

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
      { threadId: THREAD, principal: alice },
    )

    expect((await session.prompt('Get help.')).text).toBe('lead done')
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
  it('keeps the totals in the log of a durable host', async () => {
    const { runs, metadata } = memoryPersistence().stores
    const log = memoryLogStore()
    const persistence = { stores: { log, runs, metadata } }
    const first = model('main-model', lookupThenAnswer([0.01, 0.02]))
    const harness = (adapter: typeof first.adapter) =>
      defineHarness({ name: 'test/usage-durable', adapter, tools: [lookup] })
    const host = createHarnessHost({ persistence })
    const session = await host.open(harness(first.adapter), {
      threadId: THREAD,
      principal: alice,
    })
    await session.prompt('Find it.')
    const before = session.usage()
    await host.close()

    const records = (await log.read(THREAD)).filter(
      (entry) => entry.record.type === 'harness.usage',
    )
    expect(records).toHaveLength(2)

    const next = createHarnessHost({ persistence })
    const reopened = await next.open(harness(model('main-model', []).adapter), {
      threadId: THREAD,
      principal: alice,
    })
    expect(reopened.usage()).toEqual(before)
    expect(reopened.usage().total.totalTokens).toBe(45)
    await next.close()
  })

  it('keeps the totals in the metadata store of a host without a log', async () => {
    const persistence = memoryPersistence()
    const first = model('main-model', lookupThenAnswer())
    const harness = (adapter: typeof first.adapter) =>
      defineHarness({ name: 'test/usage-metadata', adapter, tools: [lookup] })
    const host = createHarnessHost({ persistence })
    const session = await host.open(harness(first.adapter), {
      threadId: THREAD,
    })
    await session.prompt('Find it.')
    await host.close()

    const next = createHarnessHost({ persistence })
    const reopened = await next.open(harness(model('main-model', []).adapter), {
      threadId: THREAD,
    })
    expect(reopened.usage().total).toMatchObject({ calls: 2, totalTokens: 45 })
    await next.close()
  })
})
