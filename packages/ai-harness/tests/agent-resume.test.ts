import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import {
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTextAdapter, ChatMiddleware } from '@tanstack/ai'
import type { HarnessDurability } from '../src'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })
const alice = { id: 'alice' }

/**
 * Host A starts the background agent `worker`. It reserves an id in a step,
 * and its model calls `lookup`, then waits in its second model call. Then
 * host A stops: its log refuses writes, and its ownership expires. Host B
 * opens the thread on the same stores.
 */
async function stopDuringAgent(options: {
  runAgainAfterCrash: boolean
  durability?: HarnessDurability
  /** The agent model of host B. */
  next: Parameters<typeof mockAdapter>[0]
}) {
  const stores = memoryPersistence().stores
  const log = memoryLogStore()
  const persistence = {
    stores: { log, metadata: stores.metadata },
  }
  const effects: Array<string> = []
  const lookup = toolDefinition({
    name: 'lookup',
    description: 'Look it up',
    inputSchema: z.object({}),
  }).server(async () => {
    effects.push('lookup')
    return { found: true }
  })
  const worker = (adapter: AnyTextAdapter) =>
    defineAgent({
      name: 'worker',
      description: 'Works',
      run: async (ctx) => {
        await ctx.harness!.step.do('reserve', () => {
          effects.push('reserve')
          return 'R-1'
        })
        return ctx.chat({ adapter, tools: [lookup] })
      },
    })
  const harness = (main: AnyTextAdapter, agent: AnyTextAdapter) =>
    defineHarness({
      name: 'test/agent-resume',
      adapter: main,
      agents: [worker(agent)],
      ...(options.durability ? { durability: options.durability } : {}),
    })

  const first = mockAdapter([
    () => toolCall('lookup', {}, 'call-1'),
    untilAborted(),
  ])
  const hostA = createHarnessHost({ persistence })
  const sessionA = await hostA.open(
    harness(mockAdapter([]).adapter, first.adapter),
    {
      threadId: THREAD,
      user: alice,
    },
  )
  const operation = sessionA.agent('worker')?.start(undefined, {
    startTurnWhenDone: true,
    ...(options.runAgainAfterCrash ? { runAgainAfterCrash: true } : {}),
  })
  if (!operation) throw new Error('No worker agent.')
  await waitFor(() => expect(first.calls).toHaveLength(2))
  expect(effects).toEqual(['reserve', 'lookup'])

  // Host A stops: its log refuses writes, so the session stops writing.
  const refuse = vi
    .spyOn(log, 'append')
    .mockRejectedValue(new Error('the host is gone'))
  await expect(
    sessionA.appendRecords({ records: [{ type: 'app.ping' }] }),
  ).rejects.toThrow()
  await expect(operation).rejects.toThrow()
  refuse.mockRestore()

  const record = (await log.read({ logId: LOG }))
    .map((entry) => entry.record)
    .find(
      (entry) =>
        entry.type === 'harness.input' &&
        (entry.input as { op?: string }).op === 'agent',
    )
  const inputId = String(record?.inputId)

  const agentModel = mockAdapter(options.next)
  const main = mockAdapter([() => text('noted')])
  const hostB = createHarnessHost({ persistence })
  const sessionB = await hostB.open(harness(main.adapter, agentModel.adapter), {
    threadId: THREAD,
    user: alice,
  })
  return { sessionB, hostB, inputId, effects, agentModel, main, stores, log }
}

describe('a background agent with runAgainAfterCrash: true', () => {
  it('runs again on the host that takes over, with its steps and transcript', async () => {
    const run = await stopDuringAgent({
      runAgainAfterCrash: true,
      next: [() => text('Worked.')],
    })

    expect(await run.sessionB.settled({ inputId: run.inputId })).toMatchObject({
      outcome: 'completed',
    })
    // The chain thread of the run is in the log of the root thread, on both
    // hosts: one thread stamp, and no log of its own.
    const threads = new Set(
      (await run.log.read({ logId: LOG })).flatMap((entry) =>
        typeof entry.record.thread === 'string' ? [entry.record.thread] : [],
      ),
    )
    expect([...threads]).toEqual([expect.stringMatching(/^t1:worker:in-/)])
    const [chain = ''] = threads
    expect(await run.log.read({ logId: logIdOf({ logId: chain }) })).toEqual([])
    // The step and the finished tool call did not run again.
    expect(run.effects).toEqual(['reserve', 'lookup'])
    // The model continues from the saved transcript, with the tool result.
    expect(run.agentModel.calls).toHaveLength(1)
    const sent = run.agentModel.calls[0].messages as Array<{
      role: string
      toolCallId?: string
    }>
    expect(
      sent.some(
        (message) => message.role === 'tool' && message.toolCallId === 'call-1',
      ),
    ).toBe(true)
    // `startTurnWhenDone`: the main model gets the result in a new turn.
    await waitFor(() => expect(run.main.calls).toHaveLength(1))
    expect(messageTexts(run.main.calls[0]).at(-1)).toContain(
      'Background agent worker finished',
    )
    await run.hostB.close()
  })

  it('fails with attempts_exhausted after durability.maxAttempts runs', async () => {
    const run = await stopDuringAgent({
      runAgainAfterCrash: true,
      durability: { maxAttempts: 1 },
      next: [() => text('never')],
    })

    expect(await run.sessionB.settled({ inputId: run.inputId })).toMatchObject({
      outcome: 'failed',
      error: { code: 'attempts_exhausted' },
    })
    expect(run.agentModel.calls).toHaveLength(0)
    expect(run.effects).toEqual(['reserve', 'lookup'])
    await run.hostB.close()
  })

  it('without runAgainAfterCrash, still fails the run that a stopped host left', async () => {
    const run = await stopDuringAgent({
      runAgainAfterCrash: false,
      next: [() => text('never')],
    })

    expect(await run.sessionB.settled({ inputId: run.inputId })).toMatchObject({
      outcome: 'failed',
      error: { message: 'The host stopped during this agent run.' },
    })
    expect(run.agentModel.calls).toHaveLength(0)
    await run.hostB.close()
  })
})

describe('the children of a run with runAgainAfterCrash: true', () => {
  it('gives a keyed child and an unkeyed child their own ids, so each agent runs', async () => {
    const a = defineAgent({
      name: 'a',
      description: 'A',
      run: async () => 'from a',
    })
    const b = defineAgent({
      name: 'b',
      description: 'B',
      run: async () => 'from b',
    })
    const lead = defineAgent({
      name: 'lead',
      description: 'Runs a with the key 1, then b with no key',
      run: async (ctx) => [
        await ctx.harness!.agents.run(a, undefined, { key: '1' }),
        await ctx.harness!.agents.run(b),
      ],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-resume',
        adapter: mockAdapter([]).adapter,
        agents: [lead, a, b],
      }),
      { threadId: THREAD },
    )

    await expect(
      session.agents.lead.start(undefined, {
        runAgainAfterCrash: true,
        addResultNote: false,
      }),
    ).resolves.toEqual(['from a', 'from b'])
    await host.close()
  })

  it('keeps the steps of a background child that outlives its parent, after a restart', async () => {
    const log = memoryLogStore()
    const { metadata } = memoryPersistence().stores
    const persistence = { stores: { log, metadata } }
    const effects: Array<string> = []
    const reserved = gate()
    const child = (adapter: AnyTextAdapter) =>
      defineAgent({
        name: 'child',
        description: 'Reserves an id, then works',
        run: async (ctx) => {
          await ctx.harness!.step.do('reserve', () => {
            effects.push('reserve')
            return 'R-1'
          })
          reserved.open()
          return ctx.chat({ adapter })
        },
      })
    const lead = defineAgent({
      name: 'lead',
      description:
        'Starts the child in the background, and ends after its step',
      run: async (ctx) => {
        void ctx
          .harness!.agents.start('child', undefined, {
            runAgainAfterCrash: true,
            addResultNote: false,
          })
          .then(undefined, () => undefined)
        await reserved.opened
        return 'started'
      },
    })
    const harness = (adapter: AnyTextAdapter) =>
      defineHarness({
        name: 'test/agent-resume',
        adapter: mockAdapter([]).adapter,
        agents: [lead, child(adapter)],
      })

    const first = mockAdapter([untilAborted()])
    const hostA = createHarnessHost({ persistence })
    const sessionA = await hostA.open(harness(first.adapter), {
      threadId: THREAD,
    })
    await expect(
      sessionA.agents.lead.start(undefined, {
        runAgainAfterCrash: true,
        addResultNote: false,
      }),
    ).resolves.toBe('started')
    await waitFor(() => expect(first.calls).toHaveLength(1))
    expect(effects).toEqual(['reserve'])

    // Host A stops while the child runs, after its parent settled.
    const refuse = vi
      .spyOn(log, 'append')
      .mockRejectedValue(new Error('the host is gone'))
    await expect(
      sessionA.appendRecords({ records: [{ type: 'app.ping' }] }),
    ).rejects.toThrow()
    refuse.mockRestore()
    const record = (await log.read({ logId: LOG }))
      .map((entry) => entry.record)
      .find(
        (entry) =>
          entry.type === 'harness.input' &&
          (entry.input as { agent?: string }).agent === 'child',
      )

    const hostB = createHarnessHost({ persistence })
    const sessionB = await hostB.open(
      harness(mockAdapter([() => text('Worked.')]).adapter),
      { threadId: THREAD },
    )
    expect(
      await sessionB.settled({ inputId: String(record?.inputId) }),
    ).toMatchObject({ outcome: 'completed' })
    // The step of the child did not run again.
    expect(effects).toEqual(['reserve'])
    await hostA.close()
    await hostB.close()
  })
})

describe('the middleware of a resumable agent run', () => {
  it("logs the tool result that the agent's own middleware gave the model", async () => {
    const persistence = memoryPersistence()
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look it up',
      inputSchema: z.object({}),
    }).server(async () => 'the raw result')
    // The agent's own middleware, after the host middleware of the run.
    const trim: ChatMiddleware = {
      name: 'test/trim',
      onAfterToolCall: () => ({ type: 'replaceResult', result: 'trimmed' }),
    }
    const model = mockAdapter([
      () => toolCall('lookup', {}, 'call-1'),
      () => text('Done.'),
    ])
    const worker = defineAgent({
      name: 'worker',
      description: 'Works',
      run: (ctx) =>
        ctx.chat({
          adapter: model.adapter,
          tools: [lookup],
          middleware: [trim],
        }),
    })
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-last-middleware',
        adapter: mockAdapter([]).adapter,
        agents: [worker],
      }),
      { threadId: THREAD, user: alice },
    )

    await session
      .agent('worker')
      ?.start(undefined, { runAgainAfterCrash: true })

    const stored = (await persistence.stores.log.read({ logId: LOG }))
      .map((entry) => entry.record)
      .filter((record) => record.type === 'harness.tool.result')
    expect(JSON.stringify(model.calls[1]?.messages)).toContain('trimmed')
    expect(stored).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({ content: 'trimmed' }),
      }),
    ])
    await host.close()
  })
})
