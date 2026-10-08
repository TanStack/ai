import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { AnyHarness, HarnessSession, Operation } from '../src'

const THREAD = 't1'
const alice = { id: 'alice' }

/** Open `harness` for alice on a host without a log. */
async function open<THarness extends AnyHarness>(
  harness: THarness,
  persistence = memoryPersistence(),
) {
  const host = createHarnessHost({ persistence })
  const session = await host.open(harness, {
    threadId: THREAD,
    principal: alice,
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
  it('keeps the messages of each background run in a thread of its own', async () => {
    const persistence = memoryPersistence()
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
      persistence,
    )

    await session.agents.drafter.start()

    expect(thread).toMatch(/^t1:drafter:in-/)
    const saved = JSON.stringify(
      await persistence.stores.messages.loadThread(thread),
    )
    expect(saved).toContain('Draft it.')
    expect(saved).toContain('Drafted.')
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
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))

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

  it('runs a steer that the run never took as a follow-up', async () => {
    const release = gate()
    const model = mockAdapter([
      after(release.opened, 'Draft one.'),
      () => text('Draft two.'),
    ])
    const { host, session } = await open(writing(model.adapter))
    const run = session.agents.writer.start()
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await run.send('Use a warmer tone.')

    expect(receipt).toMatchObject({ status: 'accepted', operationId: run.id })
    release.open()
    await run
    await vi.waitFor(() => expect(model.calls).toHaveLength(2))
    expect(messageTexts(model.calls[1]).at(-1)).toBe('Use a warmer tone.')
    expect(await session.settled(receipt.inputId)).toMatchObject({
      outcome: 'completed',
    })
    await host.close()
  })

  it('refuses a message to a run it does not know', async () => {
    const { host, session } = await open(writing(mockAdapter([]).adapter))

    expect(await session.sendToAgent('op-agent-none', 'Hello.')).toMatchObject({
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
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await run.send('Only primary sources.')
    release.open()
    await run

    expect(receipt).toMatchObject({ status: 'accepted', operationId: run.id })
    expect(model.calls).toHaveLength(2)
    expect(messageTexts(model.calls[1]).at(-1)).toBe('Only primary sources.')
    expect(await session.settled(receipt.inputId)).toMatchObject({
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
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await session.sendToAgent(run.id, 'Ignore the brief.', {
      principal: { id: 'bob' },
    })
    release.open()
    await run
    await vi.waitFor(() => expect(model.calls).toHaveLength(3))

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
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))
    const queued = await run.send('Add a title.', { mode: 'followUp' })

    expect(session.agentRuns()).toEqual([
      {
        operationId: run.id,
        agent: 'writer',
        status: 'running',
        principal: alice,
      },
      {
        operationId: queued.operationId,
        agent: 'writer',
        status: 'queued',
        principal: alice,
      },
    ])
    expect(session.agentRun(run.id)).toBe(run)
    expect(session.agentRun('op-agent-none')).toBeUndefined()
    release.open()
    await vi.waitFor(() =>
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
        runs: stores.runs,
        metadata: stores.metadata,
      },
    }
    const first = mockAdapter([() => text('Draft one.')])
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(writing(first.adapter), {
      threadId: THREAD,
      principal: alice,
    })
    const run = sessionA.agents.writer.start()
    await run
    await hostA.close()

    const second = mockAdapter([() => text('Draft two.')])
    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(writing(second.adapter), {
      threadId: THREAD,
      principal: alice,
    })

    expect(sessionB.agentRuns()).toEqual([
      {
        operationId: run.id,
        agent: 'writer',
        status: 'completed',
        principal: alice,
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
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))

    const receipt = await session.sendToAgent(run.id, 'Ignore the brief.', {
      principal: { id: 'bob' },
    })
    release.open()
    await run
    await vi.waitFor(() => expect(model.calls).toHaveLength(3))

    expect(session.agentRuns()).toMatchObject([
      { operationId: run.id, agent: 'researcher', principal: alice },
      {
        operationId: receipt.operationId,
        agent: 'researcher',
        principal: { id: 'bob' },
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
        const child = ctx.agents.start('helper')
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
        agent: 'lead',
        status: 'completed',
        principal: alice,
      },
      {
        operationId: childId,
        agent: 'helper',
        status: 'completed',
        parentRunId: run.id,
        principal: alice,
      },
    ])
    await host.close()
  })

  it('refuses a child over the tree budget, so nothing starts', async () => {
    const lead = defineAgent({
      name: 'lead',
      description: 'Starts a helper',
      run: async (ctx) => {
        try {
          ctx.agents.start('helper')
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
        void ctx.agents.start('waiter')
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
    await vi.waitFor(() => expect(listening).toEqual(['lead', 'waiter']))

    await run.cancel()

    await vi.waitFor(() => expect(stopped).toEqual(['waiter', 'lead']))
    await vi.waitFor(() =>
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
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))
    const queued = await run.send('Add a title.', { mode: 'followUp' })

    const cancelled = await session.cancel(queued.operationId)
    release.open()
    await run

    expect(cancelled).toMatchObject({
      status: 'accepted',
      operationId: queued.operationId,
    })
    expect(await session.settled(queued.inputId)).toMatchObject({
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
 * its log refuses writes, and the run's lease expires.
 */
function durable() {
  const stores = memoryPersistence().stores
  const log = memoryLogStore()
  const persistence = {
    stores: { log, runs: stores.runs, metadata: stores.metadata },
  }
  const stop = async (
    session: Pick<HarnessSession, 'append'>,
    run: Operation<unknown>,
  ) => {
    const refuse = vi
      .spyOn(log, 'append')
      .mockRejectedValue(new Error('the host is gone'))
    await expect(session.append([{ type: 'app.ping' }])).rejects.toThrow()
    await expect(run).rejects.toThrow()
    refuse.mockRestore()
    await stores.runs.update(run.id, { leaseExpiresAt: Date.now() - 1000 })
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
      principal: alice,
    })
    const run = sessionA.agents.writer.start(undefined, { resume: true })
    await vi.waitFor(() => expect(first.calls).toHaveLength(1))
    await run.send('Cite the source.', { inputId: 'steer-1' })
    await stop(sessionA, run)

    const next = mockAdapter([() => text('Cited.')])
    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(writing(next.adapter), {
      threadId: THREAD,
      principal: alice,
    })

    expect(await sessionB.settled('steer-1')).toMatchObject({
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
      principal: alice,
    })
    const run = sessionA.agents.writer.start()
    await vi.waitFor(() => expect(first.calls).toHaveLength(1))
    await run.send('Cite the source.', { inputId: 'steer-1' })
    await stop(sessionA, run)

    const next = mockAdapter([])
    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(writing(next.adapter), {
      threadId: THREAD,
      principal: alice,
    })

    expect(await sessionB.settled('steer-1')).toMatchObject({
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
      principal: alice,
    })
    const run = sessionA.agents.researcher.start()
    await vi.waitFor(() => expect(model.calls).toHaveLength(1))
    await run.send('Only primary sources.', { inputId: 'steer-2' })
    release.open()
    await vi.waitFor(() => expect(model.calls).toHaveLength(2))
    await stop(sessionA, run)

    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(harness, {
      threadId: THREAD,
      principal: alice,
    })

    expect(await sessionB.settled('steer-2')).toMatchObject({
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
      principal: alice,
    })
    const run = sessionA.agents.writer.start(undefined, { resume: true })
    await run
    const receipt = await run.send('Add a title.', {
      mode: 'followUp',
      inputId: 'follow-1',
    })
    await vi.waitFor(() => expect(first.calls).toHaveLength(2))
    const followUp = sessionA.agentRun(receipt.operationId ?? '')
    if (!followUp) throw new Error('No follow-up run.')
    await stop(sessionA, followUp)

    const next = mockAdapter([() => text('Titled.')])
    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(writing(next.adapter), {
      threadId: THREAD,
      principal: alice,
    })

    expect(await sessionB.settled('follow-1')).toMatchObject({
      outcome: 'completed',
    })
    const texts = messageTexts(next.calls[0])
    expect(texts).toContain('Draft one.')
    expect(texts.filter((item) => item === 'Add a title.')).toHaveLength(1)
    await hostB.close()
  })
})
