import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import {
  canOtherHostTake,
  gate,
  messageTexts,
  mockAdapter,
  storedRun,
  text,
  toolCall,
} from './helpers'
import type { AnyTool, SubagentRouterPick } from '@tanstack/ai'
import type { AnyAgent, HarnessSession, OwnershipOptions } from '../src'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })

/** The writer agent. It keeps the messages of each run and answers `Draft <n>`. */
function writerAgent() {
  const seen: Array<Array<string>> = []
  const agent = defineAgent({
    name: 'writer',
    description: 'Writes a draft',
    run: async (ctx) => {
      seen.push(messageTexts({ messages: ctx.messages }))
      return `Draft ${seen.length}`
    },
  })
  return { agent, seen }
}

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

/** Approve the first interrupt of `turn`, and wait for the turn that resumes. */
async function approveFirst(
  session: HarnessSession,
  turn: { interrupts?: Array<{ id: string }> },
) {
  const interrupt = turn.interrupts?.[0]
  if (!interrupt) throw new Error('The turn has no interrupt.')
  const receipt = await session.resolve({
    resume: [{ interruptId: interrupt.id, status: 'resolved', payload: true }],
  })
  const resumed = session.operation(receipt.operationId ?? '')
  if (!resumed) throw new Error('The resolve started no turn.')
  return resumed
}

/**
 * A session whose `subagents.router` always returns `pick`. The router keeps
 * the messages of each call.
 */
async function openRouted(options: {
  agent: AnyAgent
  pick: SubagentRouterPick
  replies?: Array<Reply>
  ownership?: OwnershipOptions
  tools?: ReadonlyArray<AnyTool>
}) {
  const { metadata } = memoryPersistence().stores
  const log = memoryLogStore()
  const persistence = { stores: { log, metadata } }
  const main = mockAdapter(options.replies ?? [])
  const routerSaw: Array<Array<string>> = []
  const host = createHarnessHost({
    persistence,
    ...(options.ownership ? { ownership: options.ownership } : {}),
  })
  const session = await host.open(
    defineHarness({
      name: 'test/router',
      adapter: main.adapter,
      ...(options.tools ? { tools: options.tools } : {}),
      subagents: {
        agents: [options.agent],
        router: ({ messages }) => {
          routerSaw.push(messageTexts({ messages }))
          return options.pick
        },
      },
    }),
    {
      threadId: THREAD,
    },
  )
  return { host, session, log, routerSaw, calls: main.calls }
}

describe('subagents.router', () => {
  it('gives the router the earlier turns', async () => {
    const { agent } = writerAgent()
    const { host, session, routerSaw } = await openRouted({
      agent,
      pick: 'writer',
    })
    await session.send('first')
    await session.send('second')
    expect(routerSaw).toEqual([
      ['first'],
      ['first', 'writer:\nDraft 1', 'second'],
    ])
    await host.close()
  })

  it('gives a routed agent the earlier turns, and saves each message once', async () => {
    const { agent, seen } = writerAgent()
    const { host, session } = await openRouted({
      agent,
      pick: 'writer',
    })
    await session.send('first')
    await session.send('second')
    expect(seen).toEqual([['first'], ['first', 'writer:\nDraft 1', 'second']])
    expect(messageTexts({ messages: await session.transcript() })).toEqual([
      'first',
      'writer:\nDraft 1',
      'second',
      'writer:\nDraft 2',
    ])
    await host.close()
  })

  it('returns the text of the routed agent', async () => {
    const { agent } = writerAgent()
    const { host, session, calls } = await openRouted({
      agent,
      pick: 'writer',
    })
    const turn = await session.send('go')
    expect(turn.text).toBe('writer:\nDraft 1')
    expect(calls).toHaveLength(0)
    await host.close()
  })

  it("runs the main model when the router returns 'main'", async () => {
    const { agent, seen } = writerAgent()
    const { host, session, calls } = await openRouted({
      agent,
      pick: 'main',
      replies: [() => text('Main 1'), () => text('Main 2')],
    })
    expect((await session.send('first')).text).toBe('Main 1')
    expect((await session.send('second')).text).toBe('Main 2')
    // The main model gets each earlier message once.
    expect(messageTexts(calls[1])).toEqual(['first', 'Main 1', 'second'])
    expect(seen).toEqual([])
    await host.close()
  })

  it('keeps the thread from other hosts while a routed agent runs', async () => {
    const started = gate()
    const release = gate()
    const agent = defineAgent({
      name: 'writer',
      description: 'Writes a draft',
      run: async () => {
        started.open()
        await release.opened
        return 'Done.'
      },
    })
    const { host, session, log } = await openRouted({
      agent,
      pick: 'writer',
    })
    const turn = session.send('go')
    await started.opened
    expect((await storedRun(log, { threadId: THREAD }, turn.id))?.status).toBe(
      'running',
    )
    expect(await canOtherHostTake(log, LOG)).toBe(false)
    release.open()
    expect((await turn).text).toBe('writer:\nDone.')
    await host.close()
  })

  it('gives the thread back when the turn ends', async () => {
    const { agent } = writerAgent()
    const { host, session, log } = await openRouted({
      agent,
      pick: 'writer',
      ownership: { renewEveryMs: 5 },
    })
    const renew = vi.spyOn(log, 'renewOwnership')

    await session.send('go')

    await waitFor(async () =>
      expect(await canOtherHostTake(log, LOG)).toBe(true),
    )
    const renewals = renew.mock.calls.length
    // A renewal that still runs would show within a few ticks.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(renew).toHaveBeenCalledTimes(renewals)
    await host.close()
  })

  it('resumes a routed agent that stopped for an approval', async () => {
    const remove = removeTool()
    const child = mockAdapter([
      () => toolCall('remove', { path: 'a.txt' }, 'call_c'),
      () => text('Removed a.txt'),
    ])
    const agent = defineAgent({
      name: 'cleaner',
      description: 'Removes files',
      run: (ctx) => ctx.chat({ adapter: child.adapter, tools: [remove.tool] }),
    })
    const { host, session, routerSaw, calls } = await openRouted({
      agent,
      pick: 'cleaner',
    })

    const turn = await session.send('clean up')
    expect(remove.execute).not.toHaveBeenCalled()
    const resumed = await approveFirst(session, turn)

    expect(await resumed).toEqual({
      text: 'cleaner:\nRemoved a.txt',
      media: [],
    })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    expect(routerSaw).toHaveLength(1)
    expect(calls).toHaveLength(0)
    await host.close()
  })

  it("resumes the main model's approval when the router returns 'main'", async () => {
    const remove = removeTool()
    const { agent } = writerAgent()
    const { host, session, calls } = await openRouted({
      agent,
      pick: 'main',
      tools: [remove.tool],
      replies: [
        () => toolCall('remove', { path: 'b.txt' }, 'call_m'),
        () => text('Removed b.txt'),
      ],
    })

    const turn = await session.send('clean up')
    const resumed = await approveFirst(session, turn)

    expect(await resumed).toEqual({ text: 'Removed b.txt', media: [] })
    expect(remove.execute).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
    await host.close()
  })
})
