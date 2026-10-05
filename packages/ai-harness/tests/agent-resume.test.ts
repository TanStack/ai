import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { HarnessDurability } from '../src'

const THREAD = 't1'
const alice = { id: 'alice' }

/**
 * Host A starts the background agent `worker`. It reserves an id in a step,
 * and its model calls `lookup`, then waits in its second model call. Then
 * host A stops: its log refuses writes, and its run lease expires. Host B
 * opens the thread on the same stores.
 */
async function stopDuringAgent(options: {
  resume: boolean
  durability?: HarnessDurability
  /** The agent model of host B. */
  next: Parameters<typeof mockAdapter>[0]
}) {
  const stores = memoryPersistence().stores
  const log = memoryLogStore()
  const persistence = {
    stores: { log, runs: stores.runs, metadata: stores.metadata },
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
        await ctx.step.do('reserve', () => {
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
    { threadId: THREAD, principal: alice },
  )
  const operation = sessionA.agent('worker')?.start(undefined, {
    wake: true,
    ...(options.resume ? { resume: true } : {}),
  })
  if (!operation) throw new Error('No worker agent.')
  await vi.waitFor(() => expect(first.calls).toHaveLength(2))
  expect(effects).toEqual(['reserve', 'lookup'])

  // Host A stops: its log refuses writes, so the session stops writing.
  const refuse = vi
    .spyOn(log, 'append')
    .mockRejectedValue(new Error('the host is gone'))
  await expect(sessionA.append([{ type: 'app.ping' }])).rejects.toThrow()
  await expect(operation).rejects.toThrow()
  refuse.mockRestore()
  await stores.runs.update(operation.id, { leaseExpiresAt: Date.now() - 1000 })

  const record = (await log.read(THREAD))
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
    principal: alice,
  })
  return { sessionB, hostB, inputId, effects, agentModel, main, stores }
}

describe('a background agent with resume: true', () => {
  it('runs again on the host that takes over, with its steps and transcript', async () => {
    const run = await stopDuringAgent({
      resume: true,
      next: [() => text('Worked.')],
    })

    expect(await run.sessionB.settled(run.inputId)).toMatchObject({
      outcome: 'completed',
    })
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
    // `wake`: the main model gets the result in a new turn.
    await vi.waitFor(() => expect(run.main.calls).toHaveLength(1))
    expect(messageTexts(run.main.calls[0]).at(-1)).toContain(
      'Background agent worker finished',
    )
    await run.hostB.close()
  })

  it('fails with attempts_exhausted after durability.maxAttempts runs', async () => {
    const run = await stopDuringAgent({
      resume: true,
      durability: { maxAttempts: 1 },
      next: [() => text('never')],
    })

    expect(await run.sessionB.settled(run.inputId)).toMatchObject({
      outcome: 'failed',
      error: { code: 'attempts_exhausted' },
    })
    expect(run.agentModel.calls).toHaveLength(0)
    expect(run.effects).toEqual(['reserve', 'lookup'])
    await run.hostB.close()
  })

  it('without resume, still fails the run that a stopped host left', async () => {
    const run = await stopDuringAgent({
      resume: false,
      next: [() => text('never')],
    })

    expect(await run.sessionB.settled(run.inputId)).toMatchObject({
      outcome: 'failed',
      error: { message: 'The host stopped during this agent run.' },
    })
    expect(run.agentModel.calls).toHaveLength(0)
    await run.hostB.close()
  })

  it('throws at start on a host without a log', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const worker = defineAgent({
      name: 'worker',
      description: 'Works',
      run: async () => 'done',
    })
    const session = await host.open(
      defineHarness({
        name: 'test/agent-resume-memory',
        adapter: mockAdapter([]).adapter,
        agents: [worker],
      }),
      { threadId: THREAD },
    )

    expect(() =>
      session.agent('worker')?.start(undefined, { resume: true }),
    ).toThrow('stores.log')
    await host.close()
  })
})
