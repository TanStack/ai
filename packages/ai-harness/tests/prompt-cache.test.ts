import { describe, expect, it } from 'vitest'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { mockAdapter, text, toolCall } from './helpers'
import type { PromptCacheOptions } from '@tanstack/ai'

/** Run one chat turn and return the `promptCache` the adapter got. */
async function cacheOfTurn(
  harnessCache?: PromptCacheOptions,
  sessionCache?: PromptCacheOptions,
) {
  const { adapter, calls } = mockAdapter([() => text('ok')])
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open({
    harness: defineHarness({
      name: 'test/prompt-cache',
      adapter,
      ...(harnessCache ? { promptCache: harnessCache } : {}),
    }),
    threadId: 't',
    ...(sessionCache ? { promptCache: sessionCache } : {}),
  })
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
    const session = await host.open({
      harness: defineHarness({
        name: 'test/prompt-cache-agent',
        adapter: mockAdapter([]).adapter,
        agents: [writer],
      }),
      threadId: 't',
      promptCache: 'none',
    })
    await session.agents.writer.run()
    // The agent keeps its own thread as the key.
    expect(child.calls[0].promptCache).toEqual({
      retention: 'none',
      key: expect.stringMatching(/^t:writer:in-/),
    })
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
    const session = await host.open({
      harness: defineHarness({
        name: 'test/prompt-cache-child',
        adapter: lead.adapter,
        subagents: { agents: [writer] },
      }),
      threadId: 't',
    })
    await session.send('write', { overrides: { promptCache: 'long' } })
    expect(lead.calls[0].promptCache).toEqual({ retention: 'long', key: 't' })
    // The default is 'short', so only the override gives the child 'long'.
    expect(child.calls[0].promptCache?.retention).toBe('long')
    await host.close()
  })
})
