import { describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent } from '@tanstack/ai'
import { NO_OWNER_EPOCH, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import { createHarnessClient } from '../src/client'
import { createHarnessHandler, handleHarnessSocket } from '../src/server'
import { fakeSocket, mockAdapter, readSse } from './helpers'
import type { SessionEvent } from '../src/types'

const BASE = 'http://x/api/harness'
const THREAD = 't1'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

/** What the tree reads of an event or a frame. */
type Tagged = Pick<SessionEvent, 'operationId' | 'event'>

const helper = defineAgent({
  name: 'helper',
  description: 'Helps',
  run: async () => 'helped',
})

/** Starts a helper of its own, so the tree has three levels. */
const nester = defineAgent({
  name: 'nester',
  description: 'Starts a helper',
  run: async (ctx) => await ctx.harness!.agents.run('helper'),
})

/** Runs a helper and a nester in a parallel group. */
const lead = defineAgent({
  name: 'lead',
  description: 'Runs a group',
  run: async (ctx) => {
    const results = await ctx.harness!.agents.group({}, (g) => [
      g.start('helper'),
      g.start('nester'),
    ])
    return results.join(' ')
  },
})

const harness = defineHarness({
  name: 'test/run-tags',
  adapter: mockAdapter([]).adapter,
  agents: [lead, nester, helper],
  // The helper of the nester is two levels below the lead.
  subagents: { agents: [], limits: { maxDepth: 3 } },
})

/** Is `entry` the end of the operation `operationId`? */
const isEndOf = (
  entry: { type?: string; operationId?: string; event?: any },
  operationId: string,
) =>
  entry.operationId === operationId &&
  entry.event?.type === EventType.CUSTOM &&
  entry.event.name === 'harness.operation.finished'

/**
 * The run tree that the events give: the parent of each operation, from the
 * `parentRunId` of its AG-UI RUN_STARTED.
 */
function treeOf(events: ReadonlyArray<Tagged>) {
  const tree = new Map<string, string | undefined>()
  for (const { operationId, event } of events) {
    if (event.type === EventType.RUN_STARTED) {
      tree.set(operationId, event.parentRunId)
    }
  }
  return tree
}

/** Run the lead on a new host. The tree that the session lists. */
async function runLead() {
  const persistence = memoryPersistence()
  const host = createHarnessHost({ persistence })
  const session = await host.open(harness, { threadId: THREAD })
  const run = session.agents.lead.start()
  await expect(run).resolves.toBe('helped helped')
  const expected = new Map(
    session.agentRuns().map((item) => [item.runId, item.parentRunId] as const),
  )
  return { host, session, run, expected }
}

/** The tree of the agent runs in `events`, which has the session events too. */
function agentTreeOf(
  events: ReadonlyArray<Tagged>,
  expected: Map<string, string | undefined>,
) {
  const tree = treeOf(events)
  for (const id of tree.keys()) if (!expected.has(id)) tree.delete(id)
  return tree
}

describe('run tags on session events', () => {
  it('gives the whole tree of a parallel group of agents in the root events', async () => {
    const { host, session, run, expected } = await runLead()

    const events: Array<SessionEvent> = []
    for await (const entry of session.events()) {
      events.push(entry)
      if (isEndOf(entry, run.id)) break
    }

    // The lead, its helper and nester, and the helper of the nester.
    expect(expected.size).toBe(4)
    const helpers = [...expected].filter(([, parent]) => parent === run.id)
    expect(helpers).toHaveLength(2)
    expect([...expected.values()].filter((p) => p === undefined)).toEqual([
      undefined,
    ])
    expect(agentTreeOf(events, expected)).toEqual(expected)
    for (const entry of events) expect(entry.threadId).toBe(THREAD)
    await host.close()
  })

  it('sends the tags on GET events, on the socket, and the client keeps them', async () => {
    const { host, run, expected } = await runLead()
    const handler = createHarnessHandler({ host, harness, openAccess: true })

    const sse = await readSse<any>(
      await handler(new Request(`${BASE}/events?threadId=${THREAD}`)),
      (frame) => isEndOf(frame, run.id),
    )

    const { socket, sent, receive } = fakeSocket()
    handleHarnessSocket({
      host,
      harness,
      socket,
      request: new Request(`${BASE}/socket`),
      openAccess: true,
    })
    receive({ type: 'harness.subscribe', threadId: THREAD })
    await waitFor(() =>
      expect(sent.some((frame) => isEndOf(frame, run.id))).toBe(true),
    )

    const client = createHarnessClient({
      url: BASE,
      threadId: THREAD,
      fetch: (input, init) => handler(new Request(input, init)),
    })
    const reading = new AbortController()
    const kept: Array<SessionEvent> = []
    // The run ended: read from the start, not from the snapshot cursor.
    for await (const entry of client.events({
      from: '0',
      signal: reading.signal,
    })) {
      kept.push(entry)
      if (isEndOf(entry, run.id)) break
    }
    reading.abort()

    for (const frames of [sse, sent]) {
      const events = frames.filter((frame) => frame.type === 'harness.event')
      expect(agentTreeOf(events, expected)).toEqual(expected)
      for (const frame of events) expect(frame.threadId).toBe(THREAD)
    }
    expect(agentTreeOf(kept, expected)).toEqual(expected)
    for (const entry of kept) expect(entry.threadId).toBe(THREAD)
    socket.close()
    await host.close()
  })

  it('reads an event record of an older version with no parent', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.log.append({
      logId: logIdOf({ logId: 'old' }),
      seq: 1,
      epoch: NO_OWNER_EPOCH,
      records: [
        {
          type: 'harness.event',
          operationId: 'op-old',
          event: {
            type: EventType.CUSTOM,
            name: 'test.old',
            value: null,
            timestamp: 1,
          },
        },
      ],
    })
    const host = createHarnessHost({ persistence })
    const view = await host.observe(harness, { threadId: 'old' })

    const [first] = await (async () => {
      for await (const entry of view.events()) return [entry]
      return []
    })()

    expect(first).toEqual({
      cursor: '1',
      threadId: 'old',
      operationId: 'op-old',
      event: expect.objectContaining({ name: 'test.old' }),
    })
    await host.close()
  })
})
