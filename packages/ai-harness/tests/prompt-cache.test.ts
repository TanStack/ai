import { describe, expect, it } from 'vitest'
import { defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { mockAdapter, text } from './helpers'
import type { PromptCacheOptions } from '@tanstack/ai'

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
    { threadId: 't', ...(sessionCache ? { promptCache: sessionCache } : {}) },
  )
  await session.prompt('hi')
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
      { threadId: 't', promptCache: 'none' },
    )
    await session.agents.writer.run()
    // The agent keeps its own thread as the key.
    expect(child.calls[0].promptCache).toEqual({
      retention: 'none',
      key: 't:writer',
    })
    await host.close()
  })
})
