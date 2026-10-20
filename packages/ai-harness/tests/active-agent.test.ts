import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import {
  messageTexts,
  mockAdapter,
  storedThreadState,
  text,
  toolCall,
} from './helpers'
import type { LogStore } from '@tanstack/ai-persistence'
import type {
  AnyAgent,
  HarnessRouterContext,
  HarnessRouterPick,
  HarnessSession,
} from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

/** An agent that answers `reply`, and counts its runs. */
function textAgent(name: string, reply: string) {
  const run = vi.fn(async () => reply)
  const agent = defineAgent({ name, description: `Answers ${reply}`, run })
  return { agent, run }
}

/** A router that answers `picks` in order, and keeps the context of each call. */
function scriptedRouter(...picks: Array<HarnessRouterPick>) {
  const seen: Array<HarnessRouterContext> = []
  const router = (ctx: HarnessRouterContext) => {
    seen.push(ctx)
    return picks[seen.length - 1]
  }
  return { router, seen }
}

/** Shared stores, so a second host reads what the first one wrote. */
function stores() {
  const { metadata } = memoryPersistence().stores
  const log = memoryLogStore()
  return { log, persistence: { stores: { log, metadata } } }
}

/** A session on a new host, whose harness routes with `router`. */
async function openRouting(options: {
  persistence: ReturnType<typeof stores>['persistence']
  router: (ctx: HarnessRouterContext) => HarnessRouterPick
  agents: ReadonlyArray<AnyAgent>
  replies?: Array<Reply>
}) {
  const main = mockAdapter(options.replies ?? [])
  const host = createHarnessHost({ persistence: options.persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/active-agent',
      adapter: main.adapter,
      agents: options.agents,
      routing: { router: options.router },
    }),
    { threadId: THREAD },
  )
  return { host, session, main }
}

async function handoffRecords(log: LogStore) {
  const entries = await log.read({ logId: logIdOf({ logId: THREAD }) })
  return entries
    .map((entry) => entry.record)
    .filter((record) => record.type === 'harness.handoff')
}

async function answer(session: HarnessSession, input: string) {
  return (await session.send(input)).text
}

describe('activeAgent', () => {
  it('sends a turn with no pick to the active agent, and to the main model after main', async () => {
    const billing = textAgent('billing', 'Billed')
    const { router, seen } = scriptedRouter(
      'billing',
      undefined,
      'main',
      undefined,
    )
    const { persistence, log } = stores()
    const { host, session, main } = await openRouting({
      persistence,
      router,
      agents: [billing.agent],
      replies: [() => text('Main 3'), () => text('Main 4')],
    })

    expect(await answer(session, 'one')).toBe('billing:\nBilled')
    expect(await answer(session, 'two')).toBe('billing:\nBilled')
    expect(await answer(session, 'three')).toBe('Main 3')
    expect(await answer(session, 'four')).toBe('Main 4')

    expect(billing.run).toHaveBeenCalledTimes(2)
    expect(main.calls).toHaveLength(2)
    expect(seen.map((ctx) => ctx.activeAgent)).toEqual([
      undefined,
      'billing',
      'billing',
      undefined,
    ])
    // One record when billing became active, one when main cleared it.
    expect(
      (await handoffRecords(log)).map(({ from, to, by }) => ({ from, to, by })),
    ).toEqual([
      { from: null, to: 'billing', by: 'router' },
      { from: 'billing', to: null, by: 'router' },
    ])
    await host.close()
  })

  it('writes one harness.handoff record for a { handoff, note } pick, and routes to the target', async () => {
    const billing = textAgent('billing', 'Billed')
    const { router } = scriptedRouter({
      handoff: 'billing',
      note: 'Refund for order 42',
    })
    const { persistence, log } = stores()
    const { host, session } = await openRouting({
      persistence,
      router,
      agents: [billing.agent],
    })

    const turn = session.send('refund please')

    expect((await turn).text).toBe('billing:\nBilled')
    expect(await handoffRecords(log)).toEqual([
      {
        type: 'harness.handoff',
        from: null,
        to: 'billing',
        note: 'Refund for order 42',
        runId: turn.id,
        by: 'router',
      },
    ])
    expect(
      (await storedThreadState(log, { threadId: THREAD })).activeAgent,
    ).toBe('billing')
    await host.close()
  })

  it('writes no record for a handoff to an unknown agent, and fails the turn', async () => {
    const billing = textAgent('billing', 'Billed')
    const { persistence, log } = stores()
    const { host, session } = await openRouting({
      persistence,
      router: () => ({ handoff: 'ghost' }),
      agents: [billing.agent],
    })

    await expect(session.send('go')).rejects.toThrow('Unknown subagent: ghost')
    expect(await handoffRecords(log)).toEqual([])
    await host.close()
  })

  it('keeps the active agent across a restart', async () => {
    const billing = textAgent('billing', 'Billed')
    const { persistence } = stores()
    const first = await openRouting({
      persistence,
      router: () => 'billing',
      agents: [billing.agent],
    })
    await answer(first.session, 'one')
    await first.host.close()

    const { router, seen } = scriptedRouter(undefined)
    const second = await openRouting({
      persistence,
      router,
      agents: [billing.agent],
    })

    expect(await answer(second.session, 'two')).toBe('billing:\nBilled')
    expect(seen[0]?.activeAgent).toBe('billing')
    expect(second.main.calls).toHaveLength(0)
    await second.host.close()
  })

  it('writes the move to the main model once, when the active agent went away', async () => {
    const billing = textAgent('billing', 'Billed')
    const seo = textAgent('seo', 'Ranked')
    const { persistence, log } = stores()
    const first = await openRouting({
      persistence,
      router: () => 'billing',
      agents: [billing.agent],
    })
    await answer(first.session, 'one')
    await first.host.close()

    // billing is gone. seo stays, so the harness still routes.
    const { router, seen } = scriptedRouter(undefined, undefined)
    const second = await openRouting({
      persistence,
      router,
      agents: [seo.agent],
      replies: [() => text('Main 2'), () => text('Main 3')],
    })

    expect(await answer(second.session, 'two')).toBe('Main 2')
    expect(await answer(second.session, 'three')).toBe('Main 3')
    expect(seen.map((ctx) => ctx.activeAgent)).toEqual(['billing', undefined])
    expect(
      (await handoffRecords(log)).map(({ from, to, by }) => ({ from, to, by })),
    ).toEqual([
      { from: null, to: 'billing', by: 'router' },
      { from: 'billing', to: null, by: 'router' },
    ])
    await second.host.close()
  })

  it('does not call the router to resolve a turn of the active agent', async () => {
    const execute = vi.fn(async () => ({ removed: true }))
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(execute)
    const child = mockAdapter([
      () => toolCall('remove', { path: 'a.txt' }, 'call_c'),
      () => text('Removed a.txt'),
    ])
    const cleaner = defineAgent({
      name: 'cleaner',
      description: 'Removes files',
      run: (ctx) => ctx.chat({ adapter: child.adapter, tools: [remove] }),
    })
    const { router, seen } = scriptedRouter('cleaner')
    const { persistence } = stores()
    const { host, session, main } = await openRouting({
      persistence,
      router,
      agents: [cleaner],
    })

    const turn = await session.send('clean up')
    const interrupt = turn.interrupts?.[0]
    if (!interrupt) throw new Error('The turn has no interrupt.')
    const receipt = await session.resolve({
      resume: [
        { interruptId: interrupt.id, status: 'resolved', payload: true },
      ],
    })
    const resumed = session.operation(receipt.operationId ?? '')
    if (!resumed) throw new Error('The resolve started no turn.')

    expect(await resumed).toEqual({
      text: 'cleaner:\nRemoved a.txt',
      media: [],
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(seen).toHaveLength(1)
    expect(main.calls).toHaveLength(0)
    expect(messageTexts({ messages: await session.transcript() })).toEqual([
      'clean up',
      // The note of the router handoff.
      'null',
      'Handed off to cleaner. cleaner answers next.',
      'cleaner:\nRemoved a.txt',
    ])
    await host.close()
  })
})
