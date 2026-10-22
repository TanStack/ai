import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import {
  LogConflictError,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import { isRecord } from '../src/utils'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
  wrapLogStore,
} from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { LogRecord } from '@tanstack/ai-persistence'
import type {
  AnyHarness,
  HarnessPersistence,
  HarnessSession,
  Operation,
  SessionEvent,
} from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
const alice = { id: 'alice' }

/** Open `harness` for alice. */
async function open<THarness extends AnyHarness>(
  harness: THarness,
  persistence: HarnessPersistence = memoryPersistence(),
) {
  const host = createHarnessHost({ persistence })
  const session = await host.open(harness, {
    threadId: THREAD,
    user: alice,
  })
  return { host, session }
}

/** An agent whose one `ctx.chat` gets the messages of its run. */
const writer = (adapter: AnyTextAdapter) =>
  defineAgent({
    name: 'writer',
    description: 'Writes',
    run: (ctx) => ctx.chat({ adapter }),
  })

/** A harness whose one agent is `writer` on `adapter`. */
const writing = (adapter: AnyTextAdapter) =>
  defineHarness({
    name: 'test/agent-runs',
    adapter: mockAdapter([]).adapter,
    agents: [writer(adapter)],
  })

/**
 * `researcher` calls `lookup` in its first model call. The tool waits for
 * `release`, so a test can send a message before the second model call.
 */
function researching(replies: Parameters<typeof mockAdapter>[0]) {
  const release = gate()
  const lookup = toolDefinition({
    name: 'lookup',
    description: 'Look it up',
    inputSchema: z.object({}),
  }).server(async () => {
    await release.opened
    return { found: true }
  })
  const model = mockAdapter(replies)
  const researcher = defineAgent({
    name: 'researcher',
    description: 'Researches',
    run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [lookup] }),
  })
  const harness = defineHarness({
    name: 'test/agent-runs',
    adapter: mockAdapter([]).adapter,
    agents: [researcher],
  })
  return { release, model, harness }
}

describe('the thread of an agent run', () => {
  it('keeps the messages of each background run in a thread of its own, in the log of the root thread', async () => {
    const persistence = memoryPersistence()
    const log = persistence.stores.log
    // Every log that the host writes to.
    const written = new Set<string>()
    const tracked = {
      ...persistence,
      stores: {
        ...persistence.stores,
        log: wrapLogStore(log, {
          append: (write) => {
            written.add(write.logId)
            return log.append(write)
          },
        }),
      },
    }
    const model = mockAdapter([() => text('Drafted.')])
    let thread = ''
    const drafter = defineAgent({
      name: 'drafter',
      description: 'Drafts',
      run: (ctx) => {
        thread = ctx.threadId
        return ctx.chat({
          adapter: model.adapter,
          messages: [{ role: 'user', content: 'Draft it.' }],
        })
      },
    })
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-runs',
        adapter: mockAdapter([]).adapter,
        agents: [drafter],
      }),
      tracked,
    )

    await session.agents.drafter.start()

    expect(thread).toMatch(/^t1:drafter:in-/)
    // One log for the whole tree: the chain thread writes to the log of t1.
    const root = logIdOf({ logId: THREAD })
    expect([...written]).toEqual([root])
    const chain = (await log.read({ logId: root }))
      .map((entry) => entry.record)
      .filter((record) => record.thread === thread)
    const saved = JSON.stringify(chain)
    expect(saved).toContain('Draft it.')
    expect(saved).toContain('Drafted.')
    expect(await log.read({ logId: logIdOf({ logId: thread }) })).toEqual([])
    // The transcript of the root thread does not have the chain messages,
    // only the note of the result.
    expect(JSON.stringify(await session.transcript())).not.toContain(
      'Draft it.',
    )
    await host.close()
  })

  it('gives a run that code starts a subagentRunId, and reads its transcript by it or by the run id', async () => {
    const persistence = memoryPersistence()
    const { host, session } = await open(
      writing(mockAdapter([() => text('Drafted.')]).adapter),
      persistence,
    )

    const run = session.agents.writer.start(undefined, { addResultNote: false })
    expect(typeof run.subagentRunId).toBe('string')
    await run

    expect(session.agentRuns()).toMatchObject([
      { runId: run.id, subagentRunId: run.subagentRunId },
    ])
    const contents = (messages: Array<{ content: unknown }>) =>
      messages.map((message) => message.content)
    const byRun = await session.agentTranscript({ runId: run.id })
    expect(contents(byRun)).toContain('Drafted.')
    expect(
      await session.agentTranscript({ subagentRunId: run.subagentRunId }),
    ).toEqual(byRun)
    expect(await session.agentTranscript({ runId: 'unknown' })).toEqual([])
    await host.close()

    // A view of a host with no open session reads the log the same way.
    const next = createHarnessHost({ persistence })
    const view = await next.observe(writing(mockAdapter([]).adapter), {
      threadId: THREAD,
      user: alice,
    })
    expect(await view.agentTranscript({ runId: run.id })).toEqual(byRun)
    expect(
      await view.agentTranscript({ subagentRunId: run.subagentRunId }),
    ).toEqual(byRun)
    await next.close()
  })

  it('reads the transcript of a background child of the model by its subagentRunId', async () => {
    const child = mockAdapter(() => text('Found it.'))
    const scout = defineAgent({
      name: 'scout',
      description: 'Scouts',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })
    const lead = mockAdapter([
      () => toolCall('scout', { prompt: 'Look', background: true }, 'call-1'),
      () => text('Started.'),
      () => text('Noted.'),
    ])
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-runs',
        adapter: lead.adapter,
        subagents: { agents: [scout] },
      }),
    )

    await session.send('Scout')
    await waitFor(() =>
      expect(session.agentRuns()[0]?.status).toBe('completed'),
    )
    const result = (await session.transcript()).find(
      (message) => message.role === 'tool',
    )
    const { subagentRunId } = JSON.parse(String(result?.content))

    expect(session.agentRuns()[0]?.subagentRunId).toBe(subagentRunId)
    const messages = await session.agentTranscript({ subagentRunId })
    expect(messages.map((message) => message.content)).toContain('Found it.')
    await host.close()
  })
})

describe('the receipt of an agent run', () => {
  it('resolves when the run starts, with the run as its operation', async () => {
    const { host, session } = await open(
      writing(mockAdapter([() => text('Done.')]).adapter),
    )

    const run = session.agents.writer.start()

    const receipt = await run.receipt
    expect(receipt).toMatchObject({ status: 'accepted', operationId: run.id })
    expect(receipt.inputId).toEqual(expect.any(String))
    await run
    await host.close()
  })

  it('resolves rejected for an input that the schema of the agent refuses', async () => {
    const checked = defineAgent({
      name: 'checked',
      description: 'Needs a topic',
      inputSchema: z.object({ topic: z.string() }),
      run: (ctx) => ctx.chat({ adapter: mockAdapter([]).adapter }),
    })
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-runs',
        adapter: mockAdapter([]).adapter,
        agents: [checked],
      }),
    )

    const run = session.agent('checked')?.start({ topic: 7 })
    if (!run) throw new Error('No agent checked.')

    expect(await run.receipt).toMatchObject({
      status: 'rejected',
      reason: 'invalid_input',
    })
    await expect(run).rejects.toThrow('Input validation failed')
    await host.close()
  })
})

describe('follow-ups to an agent run', () => {
  it('runs the agent again after the run ended, on its transcript', async () => {
    const model = mockAdapter([
      () => text('Draft one.'),
      () => text('Draft two.'),
    ])
    const { host, session } = await open(writing(model.adapter))
    const run = session.agents.writer.start()
    await run

    const receipt = await run.send('Make it shorter.', { mode: 'followUp' })

    expect(receipt.status).toBe('accepted')
    expect(receipt.operationId).not.toBe(run.id)
    await expect(session.operation(receipt.operationId ?? '')).resolves.toBe(
      'Draft two.',
    )
    const texts = messageTexts(model.calls[1])
    expect(texts).toContain('Draft one.')
    expect(texts.at(-1)).toBe('Make it shorter.')
    await host.close()
  })

  it('runs a follow-up that comes during the run after it, once per input id', async () => {
    const release = gate()
    const model = mockAdapter([
      after(release.opened, 'Draft one.'),
      () => text('Draft two.'),
    ])
    const { host, session } = await open(writing(model.adapter))
    const run = session.agents.writer.start()
    await waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await run.send('Add a title.', {
      mode: 'followUp',
      inputId: 'follow-1',
    })
    const retry = await run.send('Add a title.', {
      mode: 'followUp',
      inputId: 'follow-1',
    })

    expect(receipt.status).toBe('queued')
    expect(retry).toEqual(receipt)
    expect(session.operation(receipt.operationId ?? '')?.status()).toBe(
      'accepted',
    )
    release.open()
    await expect(run).resolves.toBe('Draft one.')
    await expect(session.operation(receipt.operationId ?? '')).resolves.toBe(
      'Draft two.',
    )
    expect(model.calls).toHaveLength(2)
    expect(messageTexts(model.calls[1]).at(-1)).toBe('Add a title.')
    await host.close()
  })

  it('cancels a queued follow-up when the session closes', async () => {
    const model = mockAdapter([untilAborted(), () => text('Draft two.')])
    const { host, session } = await open(writing(model.adapter))
    const run = session.agents.writer.start()
    await waitFor(() => expect(model.calls).toHaveLength(1))
    const receipt = await run.send('Add a title.', { mode: 'followUp' })
    const followUp = session.operation(receipt.operationId ?? '')

    await host.close()

    await expect(followUp).rejects.toThrow('Session closed.')
    expect(model.calls).toHaveLength(1)
  })

  it('cancels a queued follow-up when a log failure stops the session', async () => {
    const inner = memoryLogStore()
    // After `isBroken`, the store refuses each position.
    let isBroken = false
    const log = wrapLogStore(inner, {
      append: (batch) =>
        isBroken
          ? Promise.reject(new LogConflictError(batch.logId, batch.seq))
          : inner.append(batch),
    })
    const { metadata } = memoryPersistence().stores
    const model = mockAdapter([untilAborted(), () => text('Draft two.')])
    const host = createHarnessHost({
      persistence: { stores: { log, metadata } },
    })
    const session = await host.open(writing(model.adapter), {
      threadId: THREAD,
      user: alice,
    })
    const run = session.agents.writer.start()
    await waitFor(() => expect(model.calls).toHaveLength(1))
    const receipt = await run.send('Add a title.', { mode: 'followUp' })
    const followUp = session.operation(receipt.operationId ?? '')
    isBroken = true

    await Promise.resolve(session.send('Next.')).catch(() => {})

    await expect(followUp).rejects.toThrow('Session closed.')
    expect(model.calls).toHaveLength(1)
    await host.close()
  })

  it('runs a steer that the run never took as a follow-up', async () => {
    const release = gate()
    const model = mockAdapter([
      after(release.opened, 'Draft one.'),
      () => text('Draft two.'),
    ])
    const { host, session } = await open(writing(model.adapter))
    const run = session.agents.writer.start()
    await waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await run.send('Use a warmer tone.')

    expect(receipt).toMatchObject({ status: 'accepted', operationId: run.id })
    release.open()
    await run
    await waitFor(() => expect(model.calls).toHaveLength(2))
    expect(messageTexts(model.calls[1]).at(-1)).toBe('Use a warmer tone.')
    expect(await session.settled({ inputId: receipt.inputId })).toMatchObject({
      outcome: 'completed',
    })
    await host.close()
  })

  it('refuses a message to a run it does not know', async () => {
    const { host, session } = await open(writing(mockAdapter([]).adapter))

    expect(
      await session.send('Hello.', { to: 'op-agent-none' }).receipt,
    ).toMatchObject({
      status: 'rejected',
      reason: 'not_running',
    })
    await host.close()
  })
})

describe('steers to an agent run', () => {
  it('joins the next model call of the run, and settles with it', async () => {
    const { release, model, harness } = researching([
      () => toolCall('lookup', {}),
      () => text('Done.'),
    ])
    const { host, session } = await open(harness)
    const run = session.agents.researcher.start()
    await waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await run.send('Only primary sources.')
    release.open()
    await run

    expect(receipt).toMatchObject({ status: 'accepted', operationId: run.id })
    expect(model.calls).toHaveLength(2)
    expect(messageTexts(model.calls[1]).at(-1)).toBe('Only primary sources.')
    expect(await session.settled({ inputId: receipt.inputId })).toMatchObject({
      outcome: 'completed',
      operationId: run.id,
    })
    await host.close()
  })

  it('runs a steer from another sender as a follow-up, for that sender', async () => {
    const { release, model, harness } = researching([
      () => toolCall('lookup', {}),
      () => text('Done.'),
      () => text('Noted.'),
    ])
    const { host, session } = await open(harness)
    const run = session.agents.researcher.start()
    await waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await session.send('Ignore the brief.', {
      to: run.id,
      user: { id: 'bob' },
    }).receipt
    release.open()
    await run
    await waitFor(() => expect(model.calls).toHaveLength(3))

    expect(receipt.status).toBe('queued')
    expect(receipt.operationId).not.toBe(run.id)
    expect(messageTexts(model.calls[1])).not.toContain('Ignore the brief.')
    expect(messageTexts(model.calls[2]).at(-1)).toBe('Ignore the brief.')
    await host.close()
  })
})

describe('agentRuns() and agentRun(id)', () => {
  it('lists the runs of the session and finds each one', async () => {
    const release = gate()
    const model = mockAdapter([
      after(release.opened, 'Draft one.'),
      () => text('Draft two.'),
    ])
    const { host, session } = await open(writing(model.adapter))
    const run = session.agents.writer.start()
    await waitFor(() => expect(model.calls).toHaveLength(1))
    const queued = await run.send('Add a title.', { mode: 'followUp' })

    expect(session.agentRuns()).toEqual([
      {
        operationId: run.id,
        runId: run.id,
        kind: 'agent',
        agent: 'writer',
        subagentRunId: run.subagentRunId,
        status: 'running',
        user: alice,
      },
      {
        operationId: queued.operationId,
        runId: queued.operationId,
        kind: 'agent',
        agent: 'writer',
        subagentRunId: queued.operationId,
        status: 'queued',
        user: alice,
      },
    ])
    expect(session.agentRun(run.id)).toBe(run)
    expect(session.agentRun('op-agent-none')).toBeUndefined()
    release.open()
    await waitFor(() =>
      expect(session.agentRuns().map((item) => item.status)).toEqual([
        'completed',
        'completed',
      ]),
    )
    await host.close()
  })

  it('knows the runs in the log after a restart, and continues one', async () => {
    const stores = memoryPersistence().stores
    const persistence = {
      stores: {
        log: memoryLogStore(),
        metadata: stores.metadata,
      },
    }
    const first = mockAdapter([() => text('Draft one.')])
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(writing(first.adapter), {
      threadId: THREAD,
      user: alice,
    })
    const run = sessionA.agents.writer.start()
    await run
    await hostA.close()

    const second = mockAdapter([() => text('Draft two.')])
    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(writing(second.adapter), {
      threadId: THREAD,
      user: alice,
    })

    expect(sessionB.agentRuns()).toEqual([
      {
        operationId: run.id,
        runId: run.id,
        kind: 'agent',
        agent: 'writer',
        subagentRunId: run.subagentRunId,
        status: 'completed',
        user: alice,
        result: 'Draft one.',
      },
    ])
    const again = sessionB.agentRun(run.id)
    expect(again?.status()).toBe('completed')
    const receipt = await again?.send('Shorter.', { mode: 'followUp' })
    await expect(sessionB.operation(receipt?.operationId ?? '')).resolves.toBe(
      'Draft two.',
    )
    const texts = messageTexts(second.calls[0])
    expect(texts).toContain('Draft one.')
    expect(texts.at(-1)).toBe('Shorter.')
    await hostB.close()
  })

  it('lists a steer from another sender as a follow-up run of that sender', async () => {
    const { release, model, harness } = researching([
      () => toolCall('lookup', {}),
      () => text('Done.'),
      () => text('Noted.'),
    ])
    const { host, session } = await open(harness)
    const run = session.agents.researcher.start()
    await waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await session.send('Ignore the brief.', {
      to: run.id,
      user: { id: 'bob' },
    }).receipt
    release.open()
    await run
    await waitFor(() => expect(model.calls).toHaveLength(3))

    expect(session.agentRuns()).toMatchObject([
      { operationId: run.id, agent: 'researcher', user: alice },
      {
        operationId: receipt.operationId,
        agent: 'researcher',
        user: { id: 'bob' },
      },
    ])
    await host.close()
  })
})

describe('agents that agent code starts', () => {
  const helper = defineAgent({
    name: 'helper',
    description: 'Helps',
    run: async () => 'helped',
  })

  it('starts a child that records its parent run', async () => {
    let childId = ''
    const lead = defineAgent({
      name: 'lead',
      description: 'Starts a helper',
      run: async (ctx) => {
        const child = ctx.harness!.agents.start('helper')
        childId = child.id
        return await child
      },
    })
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-runs',
        adapter: mockAdapter([]).adapter,
        agents: [lead, helper],
      }),
    )

    const run = session.agents.lead.start()

    await expect(run).resolves.toBe('helped')
    expect(session.agentRuns()).toEqual([
      {
        operationId: run.id,
        runId: run.id,
        kind: 'agent',
        agent: 'lead',
        subagentRunId: run.subagentRunId,
        status: 'completed',
        user: alice,
        result: 'helped',
      },
      {
        operationId: childId,
        runId: childId,
        kind: 'agent',
        agent: 'helper',
        subagentRunId: childId,
        status: 'completed',
        parentRunId: run.id,
        user: alice,
        result: 'helped',
      },
    ])
    // The events of the lead and of its child, in one stream.
    const events = []
    for await (const entry of session.events()) {
      events.push(entry)
      const { event } = entry
      const isLeadEnd =
        entry.operationId === run.id &&
        event.type === EventType.CUSTOM &&
        event.name === 'harness.operation.finished'
      if (isLeadEnd) break
    }
    const ofChild = events.filter((entry) => entry.operationId === childId)
    const ofLead = events.filter((entry) => entry.operationId === run.id)
    expect(ofChild.length).toBeGreaterThan(0)
    expect(ofLead.length).toBeGreaterThan(0)
    // The RUN_STARTED of a child run names its parent. The lead has none.
    const startOf = (entries: Array<SessionEvent>) =>
      entries.find((entry) => entry.event.type === EventType.RUN_STARTED)?.event
    expect(startOf(ofChild)).toMatchObject({ parentRunId: run.id })
    expect(startOf(ofLead)).not.toHaveProperty('parentRunId')
    await host.close()
  })

  it('runs a child and a group of children with run and group', async () => {
    const lead = defineAgent({
      name: 'lead',
      description: 'Runs helpers',
      run: async (ctx) => {
        const one = await ctx.harness!.agents.run(helper)
        const [two, three] = await ctx.harness!.agents.group({}, (g) => [
          g.start(helper),
          g.start('helper'),
        ])
        return [one, two, three].join(' ')
      },
    })
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-runs',
        adapter: mockAdapter([]).adapter,
        agents: [lead, helper],
      }),
    )

    const run = session.agents.lead.start()

    await expect(run).resolves.toBe('helped helped helped')
    const children = session
      .agentRuns()
      .filter((item) => item.agent === 'helper')
    expect(children).toHaveLength(3)
    for (const child of children) expect(child.parentRunId).toBe(run.id)
    await host.close()
  })

  it('refuses a child over the tree budget, so nothing starts', async () => {
    const lead = defineAgent({
      name: 'lead',
      description: 'Starts a helper',
      run: async (ctx) => {
        try {
          ctx.harness!.agents.start('helper')
          return 'started'
        } catch (error) {
          return String(error)
        }
      },
    })
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-runs',
        adapter: mockAdapter([]).adapter,
        agents: [lead, helper],
        subagents: { agents: [], limits: { maxDepth: 1 } },
      }),
    )

    await expect(session.agents.lead.start()).resolves.toContain(
      'subagent limit reached (maxDepth 1)',
    )
    expect(session.agentRuns().map((item) => item.agent)).toEqual(['lead'])
    await host.close()
  })

  it('cancels the children of a run before the run', async () => {
    const listening: Array<string> = []
    const stopped: Array<string> = []
    const waitForAbort = (name: string, signal: AbortSignal | undefined) =>
      new Promise<string>((resolve) => {
        listening.push(name)
        signal?.addEventListener('abort', () => {
          stopped.push(name)
          resolve('stopped')
        })
      })
    const waiter = defineAgent({
      name: 'waiter',
      description: 'Waits',
      run: (ctx) => waitForAbort('waiter', ctx.abortSignal),
    })
    const lead = defineAgent({
      name: 'lead',
      description: 'Starts a waiter, then waits',
      run: (ctx) => {
        void ctx.harness!.agents.start('waiter')
        return waitForAbort('lead', ctx.abortSignal)
      },
    })
    const { host, session } = await open(
      defineHarness({
        name: 'test/agent-runs',
        adapter: mockAdapter([]).adapter,
        agents: [lead, waiter],
      }),
    )
    const run = session.agents.lead.start()
    await waitFor(() => expect(listening).toEqual(['lead', 'waiter']))

    await run.cancel()

    await waitFor(() => expect(stopped).toEqual(['waiter', 'lead']))
    await waitFor(() =>
      expect(session.agentRuns().map((item) => item.status)).toEqual([
        'cancelled',
        'cancelled',
      ]),
    )
    await host.close()
  })

  it('cancels a follow-up that waits, so it never runs', async () => {
    const release = gate()
    const model = mockAdapter([after(release.opened, 'Draft one.')])
    const { host, session } = await open(writing(model.adapter))
    const run = session.agents.writer.start()
    await waitFor(() => expect(model.calls).toHaveLength(1))
    const queued = await run.send('Add a title.', { mode: 'followUp' })

    const cancelled = await session.cancel({ operationId: queued.operationId })
    release.open()
    await run

    expect(cancelled).toMatchObject({
      status: 'accepted',
      operationId: queued.operationId,
    })
    expect(await session.settled({ inputId: queued.inputId })).toMatchObject({
      outcome: 'aborted',
    })
    expect(model.calls).toHaveLength(1)
    expect(session.agentRuns().map((item) => item.operationId)).toEqual([
      run.id,
    ])
    await host.close()
  })
})

/**
 * Two hosts on one durable store. `stop` makes host A stop during `run`:
 * its log refuses writes, so it gives the log up.
 */
function durable() {
  const stores = memoryPersistence().stores
  const log = memoryLogStore()
  const persistence = {
    stores: { log, metadata: stores.metadata },
  }
  const stop = async (
    session: Pick<HarnessSession, 'appendRecords'>,
    run: Operation<unknown>,
  ) => {
    const refuse = vi
      .spyOn(log, 'append')
      .mockRejectedValue(new Error('the host is gone'))
    await expect(
      session.appendRecords({ records: [{ type: 'app.ping' }] }),
    ).rejects.toThrow()
    await expect(run).rejects.toThrow()
    refuse.mockRestore()
  }
  return { persistence, stop }
}

describe('messages to an agent run after its host stopped', () => {
  it('gives a resumed run the steer it had not taken', async () => {
    const { persistence, stop } = durable()
    const first = mockAdapter([untilAborted()])
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(writing(first.adapter), {
      threadId: THREAD,
      user: alice,
    })
    const run = sessionA.agents.writer.start(undefined, {
      runAgainAfterCrash: true,
    })
    await waitFor(() => expect(first.calls).toHaveLength(1))
    await run.send('Cite the source.', { inputId: 'steer-1' })
    await stop(sessionA, run)

    const next = mockAdapter([() => text('Cited.')])
    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(writing(next.adapter), {
      threadId: THREAD,
      user: alice,
    })

    expect(await sessionB.settled({ inputId: 'steer-1' })).toMatchObject({
      outcome: 'completed',
    })
    expect(messageTexts(next.calls[0])).toContain('Cite the source.')
    await hostB.close()
  })

  it('settles the waiting messages of a run that cannot resume as aborted', async () => {
    const { persistence, stop } = durable()
    const first = mockAdapter([untilAborted()])
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(writing(first.adapter), {
      threadId: THREAD,
      user: alice,
    })
    const run = sessionA.agents.writer.start()
    await waitFor(() => expect(first.calls).toHaveLength(1))
    await run.send('Cite the source.', { inputId: 'steer-1' })
    await stop(sessionA, run)

    const next = mockAdapter([])
    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(writing(next.adapter), {
      threadId: THREAD,
      user: alice,
    })

    expect(await sessionB.settled({ inputId: 'steer-1' })).toMatchObject({
      outcome: 'aborted',
    })
    expect(next.calls).toHaveLength(0)
    await hostB.close()
  })

  it('fails a steer that joined a run that cannot resume', async () => {
    const { persistence, stop } = durable()
    const { release, model, harness } = researching([
      () => toolCall('lookup', {}),
      untilAborted(),
    ])
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(harness, {
      threadId: THREAD,
      user: alice,
    })
    const run = sessionA.agents.researcher.start()
    await waitFor(() => expect(model.calls).toHaveLength(1))
    await run.send('Only primary sources.', { inputId: 'steer-2' })
    release.open()
    await waitFor(() => expect(model.calls).toHaveLength(2))
    await stop(sessionA, run)

    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(harness, {
      threadId: THREAD,
      user: alice,
    })

    expect(await sessionB.settled({ inputId: 'steer-2' })).toMatchObject({
      outcome: 'failed',
    })
    await hostB.close()
  })

  it('continues a follow-up run whose host stopped, with its message once', async () => {
    const { persistence, stop } = durable()
    const first = mockAdapter([() => text('Draft one.'), untilAborted()])
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(writing(first.adapter), {
      threadId: THREAD,
      user: alice,
    })
    const run = sessionA.agents.writer.start(undefined, {
      runAgainAfterCrash: true,
    })
    await run
    const receipt = await run.send('Add a title.', {
      mode: 'followUp',
      inputId: 'follow-1',
    })
    await waitFor(() => expect(first.calls).toHaveLength(2))
    const followUp = sessionA.agentRun(receipt.operationId ?? '')
    if (!followUp) throw new Error('No follow-up run.')
    await stop(sessionA, followUp)

    const next = mockAdapter([() => text('Titled.')])
    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(writing(next.adapter), {
      threadId: THREAD,
      user: alice,
    })

    expect(await sessionB.settled({ inputId: 'follow-1' })).toMatchObject({
      outcome: 'completed',
    })
    const texts = messageTexts(next.calls[0])
    expect(texts).toContain('Draft one.')
    expect(texts.filter((item) => item === 'Add a title.')).toHaveLength(1)
    await hostB.close()
  })
})

describe('an agent run whose log write fails', () => {
  it('fails the run when the log cannot record its end', async () => {
    const inner = memoryLogStore()
    let agentRunId = ''
    // Only the end record of the agent run itself fails.
    const isAgentEnd = (record: LogRecord) =>
      record.type === 'harness.run.update' &&
      record.runId === agentRunId &&
      isRecord(record.patch) &&
      record.patch.status === 'completed'
    const log = wrapLogStore(inner, {
      append: (batch) =>
        batch.records.some(isAgentEnd)
          ? Promise.reject(new Error('log down'))
          : inner.append(batch),
    })
    const { session, host } = await open(
      writing(mockAdapter([() => text('Done.')]).adapter),
      { stores: { log } },
    )

    const run = session.agents.writer.start(undefined)
    agentRunId = run.id
    await expect(run).rejects.toThrow('log down')
    expect(run.status()).toBe('failed')
    await host.close()
  })
})
