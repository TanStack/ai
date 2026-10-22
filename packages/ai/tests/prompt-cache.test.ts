import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src'
import { createMockAdapter, ev } from './test-utils'
import type { PromptCacheOptions, ResolvedPromptCache } from '../src'

const done = [ev.runStarted(), ev.runFinished('stop')]

interface CallerIds {
  promptCache?: PromptCacheOptions
  threadId?: string
}

/** Run one chat() call and give back the first adapter call. */
async function firstAdapterCall(ids: CallerIds) {
  const { adapter, calls } = createMockAdapter({ iterations: [done] })
  await chat({
    threadId: 'thread-1',
    adapter,
    messages: [{ role: 'user', content: 'hi' }],
    stream: false,
    ...ids,
  })
  return calls[0]
}

describe('chat({ promptCache })', () => {
  it('uses the threadId as the key by default', async () => {
    const call = await firstAdapterCall({})
    expect(call?.threadId).toBe('thread-1')
    expect(call?.promptCache).toStrictEqual({
      retention: 'short',
      key: 'thread-1',
    })
  })

  it.each<[string, CallerIds, ResolvedPromptCache]>([
    [
      'a threadId is the key',
      { threadId: 't1' },
      { retention: 'short', key: 't1' },
    ],
    [
      "'none' keeps the key",
      { promptCache: 'none', threadId: 't1' },
      { retention: 'none', key: 't1' },
    ],
    [
      'an object key wins over the threadId',
      { threadId: 't1', promptCache: { retention: 'long', key: 'k-1' } },
      { retention: 'long', key: 'k-1' },
    ],
    [
      'an object with only a key is short',
      { promptCache: { key: 'k-1' } },
      { retention: 'short', key: 'k-1' },
    ],
  ])('%s', async (_name, ids, expected) => {
    const call = await firstAdapterCall(ids)
    expect(call?.promptCache).toStrictEqual(expected)
  })

  it('reaches structuredOutput when there is an outputSchema and no tools', async () => {
    let seen: ResolvedPromptCache | undefined
    const { adapter } = createMockAdapter({
      structuredOutput: async (options) => {
        seen = options.chatOptions.promptCache
        return { data: { name: 'Ada' }, rawText: '{"name":"Ada"}' }
      },
    })
    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'Who?' }],
      threadId: 't1',
      promptCache: 'long',
      outputSchema: z.object({ name: z.string() }),
    })
    expect(result).toEqual({ name: 'Ada' })
    expect(seen).toStrictEqual({ retention: 'long', key: 't1' })
  })
})
