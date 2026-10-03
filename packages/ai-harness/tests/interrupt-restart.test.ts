import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { mockAdapter, text, toolCall } from './helpers'
import type { AnyTool } from '@tanstack/ai'
import type { AnyAgent, HarnessRouting, HarnessSubagents } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

/** A tool that asks approval before it removes a file. */
function removeTool() {
  const execute = vi.fn(async () => ({ removed: true }))
  const tool = toolDefinition({
    name: 'remove',
    description: 'Remove a file',
    needsApproval: true,
    inputSchema: z.object({ path: z.string() }),
  }).server(execute)
  return { tool, execute }
}

/** An agent whose model asks approval to remove `a.txt`, then reports. */
function cleanerAgent(tool: AnyTool) {
  const child = mockAdapter([
    () => toolCall('remove', { path: 'a.txt' }, 'call_c'),
    () => text('Removed a.txt'),
  ])
  return defineAgent({
    name: 'cleaner',
    description: 'Removes files',
    run: (ctx) => ctx.chat({ adapter: child.adapter, tools: [tool] }),
  })
}

/**
 * The stores of one thread, and a function that opens a new host on them,
 * like a server that started again. `durable` gives the hosts a log.
 */
function restartable(durable: boolean) {
  const { stores } = memoryPersistence()
  const { runs, metadata } = stores
  const log = memoryLogStore()
  const persistence = durable ? { stores: { log, runs, metadata } } : { stores }
  return (options: {
    tools?: ReadonlyArray<AnyTool>
    agents?: ReadonlyArray<AnyAgent>
    subagents?: HarnessSubagents<ReadonlyArray<AnyAgent>>
    routing?: HarnessRouting
    replies?: Array<Reply>
  }) => {
    const main = mockAdapter(options.replies ?? [])
    const host = createHarnessHost({ persistence })
    const opened = host.open(
      defineHarness({
        name: 'test/interrupt-restart',
        adapter: main.adapter,
        ...(options.tools ? { tools: options.tools } : {}),
        ...(options.agents ? { agents: options.agents } : {}),
        ...(options.subagents ? { subagents: options.subagents } : {}),
        ...(options.routing ? { routing: options.routing } : {}),
      }),
      { threadId: THREAD },
    )
    return opened.then((session) => ({ host, session, calls: main.calls }))
  }
}

describe.each([
  { host: 'a host without a log', durable: false },
  { host: 'a durable host', durable: true },
])('a resolve after a restart on $host', ({ durable }) => {
  it("continues the main model's approval", async () => {
    const open = restartable(durable)
    const remove = removeTool()
    const first = await open({
      tools: [remove.tool],
      replies: [() => toolCall('remove', { path: 'b.txt' }, 'call_m')],
    })
    const stopped = await first.session.prompt('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    await first.host.close()

    const next = await open({
      tools: [remove.tool],
      replies: [() => text('Removed b.txt')],
    })
    expect(
      next.session.snapshot().pendingInterrupts.map((item) => item.id),
    ).toEqual([interrupt.id])
    const receipt = await next.session.resolve([
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ])
    expect(receipt.status).toBe('accepted')
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'Removed b.txt',
    })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    await next.host.close()
  })

  it('offers an interrupt once: after its resolve, a restart has none', async () => {
    const open = restartable(durable)
    const remove = removeTool()
    const first = await open({
      tools: [remove.tool],
      replies: [
        () => toolCall('remove', { path: 'b.txt' }, 'call_m'),
        () => text('Removed b.txt'),
      ],
    })
    const stopped = await first.session.prompt('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    const receipt = await first.session.resolve([
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ])
    await first.session.operation(receipt.operationId ?? '')
    await first.host.close()

    const next = await open({ tools: [remove.tool] })
    expect(next.session.snapshot().pendingInterrupts).toEqual([])
    expect(
      await next.session.resolve([
        { interruptId: interrupt.id, status: 'resolved', payload: true },
      ]),
    ).toMatchObject({ status: 'rejected', reason: 'no_pending_interrupts' })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    await next.host.close()
  })

  it('continues a subagents.router agent that stopped for approval', async () => {
    const open = restartable(durable)
    const remove = removeTool()
    const cleaner = cleanerAgent(remove.tool)
    const subagents = { agents: [cleaner], router: () => 'cleaner' }
    const first = await open({ subagents })
    const stopped = await first.session.prompt('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    await first.host.close()

    const next = await open({ subagents })
    const receipt = await next.session.resolve([
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ])
    expect(receipt.status).toBe('accepted')
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'cleaner:\nRemoved a.txt',
    })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    expect(next.calls).toHaveLength(0)
    await next.host.close()
  })

  it('continues the plan of a root agent that stopped for approval', async () => {
    const open = restartable(durable)
    const remove = removeTool()
    const cleaner = cleanerAgent(remove.tool)
    const router = vi.fn(() => 'cleaner')
    const first = await open({ agents: [cleaner], routing: { router } })
    const stopped = await first.session.prompt('clean up')
    const interrupt = stopped.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    await first.host.close()

    const next = await open({ agents: [cleaner], routing: { router } })
    const receipt = await next.session.resolve([
      { interruptId: interrupt.id, status: 'resolved', payload: true },
    ])
    expect(receipt.status).toBe('accepted')
    expect(await next.session.operation(receipt.operationId ?? '')).toEqual({
      text: 'cleaner:\nRemoved a.txt',
    })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    // The resolve continues the saved plan. It does not ask the router again.
    expect(router).toHaveBeenCalledTimes(1)
    await next.host.close()
  })
})
