import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { mockAdapter, text, toolCall } from './helpers'
import type { PromptCacheOptions } from '@tanstack/ai'
import type { HarnessRunContext } from '../src'
import type { Reply } from './helpers'

/** Run one chat turn and return the `promptCache` the adapter got. */
async function cacheOfTurn(
  harnessCache?: PromptCacheOptions,
  sessionCache?: PromptCacheOptions,
) {
  const { adapter, calls } = mockAdapter([() => text('ok')])
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({
      name: 'test/prompt-cache',
      adapter,
      ...(harnessCache ? { promptCache: harnessCache } : {}),
    }),
    {
      threadId: 't',
      ...(sessionCache ? { promptCache: sessionCache } : {}),
    },
  )
  await session.send('hi')
  await host.close()
  return calls[0].promptCache
}

describe('prompt cache', () => {
  it('caches short, keyed by the threadId, by default', async () => {
    expect(await cacheOfTurn()).toEqual({ retention: 'short', key: 't' })
  })

  it('uses the harness retention', async () => {
    expect(await cacheOfTurn('long')).toEqual({ retention: 'long', key: 't' })
  })

  it('takes the session key and keeps the harness retention', async () => {
    expect(await cacheOfTurn('long', { key: 'aff-1' })).toEqual({
      retention: 'long',
      key: 'aff-1',
    })
  })

  it('turns caching off for one session with none', async () => {
    expect(await cacheOfTurn('long', 'none')).toEqual({
      retention: 'none',
      key: 't',
    })
  })

  it('gives an agent run the session retention', async () => {
    const child = mockAdapter([() => text('drafted')])
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes text',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/prompt-cache-agent',
        adapter: mockAdapter([]).adapter,
        agents: [writer],
      }),
      {
        threadId: 't',
        promptCache: 'none',
      },
    )
    await session.agents.writer.run()
    // The agent keeps its own thread as the key.
    expect(child.calls[0].promptCache).toEqual({
      retention: 'none',
      key: expect.stringMatching(/^t:writer:in-/),
    })
    await host.close()
  })

  it('keeps the messages of the earlier call as the prefix of a handoff target, with the note after them', async () => {
    // The messages of each call as the model got them, before a later call
    // can change them.
    const seen: Array<Array<unknown>> = []
    const keep =
      (reply: Reply): Reply =>
      (options) => {
        seen.push(structuredClone(options.messages))
        return reply(options)
      }
    const escalate = toolDefinition({
      name: 'escalate',
      description: 'Hand the user to billing',
      inputSchema: z.object({}),
    }).server<HarnessRunContext>(async (_args, ctx) => {
      await ctx.context.run.handoff({ to: 'billing' })
      return 'moved'
    })
    const billingModel = mockAdapter([keep(() => text('Refunded'))])
    const billing = defineAgent({
      name: 'billing',
      description: 'Billing',
      run: (ctx) => ctx.chat({ adapter: billingModel.adapter }),
    })
    const main = mockAdapter([
      keep(() => toolCall('escalate', {}, 'call_e')),
      keep(() => text('never')),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/prompt-cache-handoff',
        adapter: main.adapter,
        tools: [escalate],
        agents: [billing],
        routing: { router: () => undefined },
      }),
      { threadId: 't' },
    )
    await session.send('refund please', { inputId: 'in-1' })

    const [first, target] = seen
    if (!first || !target) throw new Error('No model call of the target.')
    expect(target.slice(0, first.length)).toEqual(first)
    expect(target.slice(-2)).toMatchObject([
      { role: 'assistant', toolCalls: [{ id: 'handoff_in-1_1' }] },
      { role: 'tool', toolCallId: 'handoff_in-1_1' },
    ])
    await host.close()
  })

  it('gives a tool-mode child the retention of a turn override', async () => {
    const child = mockAdapter([() => text('drafted')])
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes text',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })
    const lead = mockAdapter([
      () => toolCall('writer', { prompt: 'Draft it' }),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/prompt-cache-child',
        adapter: lead.adapter,
        subagents: { agents: [writer] },
      }),
      {
        threadId: 't',
      },
    )
    await session.send('write', { overrides: { promptCache: 'long' } })
    expect(lead.calls[0].promptCache).toEqual({ retention: 'long', key: 't' })
    // The default is 'short', so only the override gives the child 'long'.
    expect(child.calls[0].promptCache?.retention).toBe('long')
    await host.close()
  })
})
