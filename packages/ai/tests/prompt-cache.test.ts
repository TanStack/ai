import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { createMockAdapter, ev } from './test-utils'
import type { PromptCacheOptions, ResolvedPromptCache } from '../src'

const done = [ev.runStarted(), ev.runFinished('stop')]

interface CallerIds {
  promptCache?: PromptCacheOptions
  threadId?: string
  conversationId?: string
}

/** Run one chat() call and give back the first adapter call. */
async function firstAdapterCall(ids: CallerIds) {
  const { adapter, calls } = createMockAdapter({ iterations: [done] })
  await chat({
    adapter,
    messages: [{ role: 'user', content: 'hi' }],
    stream: false,
    ...ids,
  })
  return calls[0]
}

describe('chat({ promptCache })', () => {
  it('sends short and no key when the caller gives no threadId', async () => {
    const call = await firstAdapterCall({})
    // chat() made up a threadId. It is not the key.
    expect(call?.threadId).toMatch(/.+/)
    expect(call?.promptCache).toStrictEqual({ retention: 'short' })
  })

  it.each<[string, CallerIds, ResolvedPromptCache]>([
    [
      'a threadId is the key',
      { threadId: 't1' },
      { retention: 'short', key: 't1' },
    ],
    [
      'a conversationId alone is the key',
      { conversationId: 'c1' },
      { retention: 'short', key: 'c1' },
    ],
    ['an empty threadId is no key', { threadId: '' }, { retention: 'short' }],
    [
      "'none' keeps the key",
      { promptCache: 'none', threadId: 't1' },
      { retention: 'none', key: 't1' },
    ],
    ["'long' with no threadId", { promptCache: 'long' }, { retention: 'long' }],
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

describe('chat({ promptCache }) with subagents', () => {
  it("gives a ctx.chat() child the parent's retention and the child threadId as key", async () => {
    const child = createMockAdapter({ iterations: [done] })
    const helper = defineAgent({
      name: 'helper',
      description: 'Uses ctx.chat',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })
    await chat({
      adapter: createMockAdapter({ iterations: [] }).adapter,
      messages: [{ role: 'user', content: 'Go' }],
      threadId: 't1',
      promptCache: 'none',
      stream: false,
      subagents: { agents: [helper], router: () => 'helper' },
    })
    expect(child.calls[0]?.promptCache).toStrictEqual({
      retention: 'none',
      key: 't1:helper',
    })
  })

  it("gives a plain chat({ ...ctx.forward }) child the parent's retention", async () => {
    const child = createMockAdapter({ iterations: [done] })
    const helper = defineAgent({
      name: 'helper',
      description: 'Uses plain chat()',
      run: (ctx) =>
        chat({
          adapter: child.adapter,
          messages: ctx.messages,
          stream: false,
          ...ctx.forward,
        }),
    })
    await chat({
      adapter: createMockAdapter({ iterations: [] }).adapter,
      messages: [{ role: 'user', content: 'Go' }],
      threadId: 't1',
      promptCache: 'none',
      stream: false,
      subagents: { agents: [helper], router: () => 'helper' },
    })
    expect(child.calls[0]?.promptCache).toStrictEqual({
      retention: 'none',
      key: 't1:helper',
    })
  })

  it('keeps the made-up threadId of a subagent parent out of the key', async () => {
    const parent = createMockAdapter({ iterations: [done] })
    await chat({
      adapter: parent.adapter,
      messages: [{ role: 'user', content: 'Go' }],
      stream: false,
      subagents: {
        agents: [
          defineAgent({
            name: 'helper',
            description: 'Idle',
            run: async function* () {},
          }),
        ],
      },
    })
    expect(parent.calls[0]?.threadId).toMatch(/^thread-/)
    expect(parent.calls[0]?.promptCache).toStrictEqual({ retention: 'short' })
  })
})
