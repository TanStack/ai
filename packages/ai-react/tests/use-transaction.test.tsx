import { describe, expect, expectTypeOf, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { chatVerb, defineTransaction, verb } from '@tanstack/ai/transaction'
import { stream } from '@tanstack/ai-client'
import { z } from 'zod'
import { useTransaction } from '../src/use-transaction.js'

// A connection adapter that replays canned chunks per verb, branching on the
// `verb` discriminator forwarded by TransactionClient.
function fakeConnection() {
  return stream(async function* (_messages, data) {
    const verbName = (data as Record<string, unknown> | undefined)?.verb

    if (verbName === 'primaryChat') {
      yield { type: 'RUN_STARTED', threadId: 't', runId: 'r' } as any
      yield {
        type: 'TEXT_MESSAGE_START',
        messageId: 'm1',
        role: 'assistant',
      } as any
      yield {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'm1',
        delta: 'hello',
      } as any
      yield { type: 'TEXT_MESSAGE_END', messageId: 'm1' } as any
      yield { type: 'RUN_FINISHED', threadId: 't', runId: 'r' } as any
    } else if (verbName === 'blogPost') {
      // A transaction run: one banner sub-run, then the final result.
      yield { type: 'RUN_STARTED', threadId: 't', runId: 'r' } as any
      yield {
        type: 'CUSTOM',
        name: 'transaction:sub-run:started',
        value: { runId: 'r-sub-0', parentRunId: 'r', verb: 'banner', index: 0 },
      } as any
      yield {
        type: 'CUSTOM',
        name: 'transaction:sub-run:result',
        value: {
          runId: 'r-sub-0',
          verb: 'banner',
          index: 0,
          result: { url: 'hero.png' },
        },
      } as any
      yield {
        type: 'CUSTOM',
        name: 'generation:result',
        value: { title: 'Foxes', heroUrl: 'hero.png' },
      } as any
      yield { type: 'RUN_FINISHED', threadId: 't', runId: 'r' } as any
    } else {
      yield { type: 'RUN_STARTED', threadId: 't', runId: 'r' } as any
      yield {
        type: 'CUSTOM',
        name: 'generation:result',
        value: { url: 'u' },
      } as any
      yield { type: 'RUN_FINISHED', threadId: 't', runId: 'r' } as any
    }
  })
}

function makeTransaction() {
  const banner = verb({
    input: z.object({ prompt: z.string() }),
    execute: async ({ input }) => ({ url: `img:${input.prompt}` }),
  })
  return defineTransaction({
    primaryChat: chatVerb(async function* (r: any) {
      yield { type: 'RUN_STARTED', threadId: r.threadId, runId: r.runId } as any
    } as any),
    banner,
    blogPost: verb({
      input: z.object({ topic: z.string() }),
      execute: async ({ input }, ctx) => {
        const hero = await ctx.call(banner, { prompt: input.topic })
        return { title: input.topic, heroUrl: hero.url }
      },
    }),
  })
}

describe('useTransaction', () => {
  it('exposes only the declared verbs, by kind', () => {
    const txn = makeTransaction()
    const { result } = renderHook(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )
    expect(result.current.primaryChat).toBeDefined()
    expect(result.current.primaryChat.sendMessage).toBeDefined()
    expect(result.current.banner).toBeDefined()
    expect(result.current.banner.run).toBeDefined()
    expect(result.current.blogPost).toBeDefined()
    expect((result.current as any).speech).toBeUndefined()
  })

  it('run() on a one-shot verb populates its result, typed by the schema', async () => {
    const txn = makeTransaction()
    const { result } = renderHook(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    // The input type comes from the verb's schema.
    expectTypeOf(result.current.banner.run)
      .parameter(0)
      .toEqualTypeOf<{ prompt: string }>()

    // Holder object (not a bare `let`) so TS keeps the awaited return type
    // at the read site.
    const captured: { value: typeof result.current.banner.result } = {
      value: null,
    }
    await act(async () => {
      captured.value = await result.current.banner.run({ prompt: 'a fox' })
    })

    expect(captured.value?.url).toBe('u')
    expect(result.current.banner.result?.url).toBe('u')
  })

  it('sendMessage() on a chat verb populates its messages', async () => {
    const txn = makeTransaction()
    const { result } = renderHook(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    const captured: { value: typeof result.current.primaryChat.messages } = {
      value: [],
    }
    await act(async () => {
      captured.value = await result.current.primaryChat.sendMessage('hi')
    })

    expect(captured.value.length).toBeGreaterThan(0)
    expect(result.current.primaryChat.messages.length).toBeGreaterThan(0)
  })

  it('surfaces live sub-run state on a transaction run', async () => {
    const txn = makeTransaction()
    const { result } = renderHook(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    await act(async () => {
      await result.current.blogPost.run({ topic: 'foxes' })
    })

    expect(result.current.blogPost.result).toEqual({
      title: 'Foxes',
      heroUrl: 'hero.png',
    })
    expect(result.current.blogPost.subRuns).toHaveLength(1)
    expect(result.current.blogPost.subRuns[0]).toMatchObject({
      verb: 'banner',
      status: 'success',
      result: { url: 'hero.png' },
    })
    // The sibling banner surface is untouched by the transaction's sub-run.
    expect(result.current.banner.result).toBeNull()
  })

  it('exposes chat partial/final with cleared defaults on first render', () => {
    const txn = makeTransaction()
    const { result } = renderHook(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    expect((result.current.primaryChat as any).partial).toEqual({})
    expect((result.current.primaryChat as any).final).toBeNull()
  })

  it('applies a one-shot onResult transform and infers its type', async () => {
    const txn = makeTransaction()
    const { result } = renderHook(() =>
      useTransaction(txn, {
        connection: fakeConnection(),
        verbs: {
          banner: {
            onResult: (raw) => {
              // The transform's input is the verb's typed result
              // (`toEqualTypeOf` fails if `raw` were `any`).
              expectTypeOf(raw).toEqualTypeOf<{ url: string }>()
              return raw.url
            },
          },
        },
      }),
    )

    // The surface `result` is the transform's (non-nullish) return type.
    expectTypeOf(result.current.banner.result).toEqualTypeOf<string | null>()

    const captured: { value: typeof result.current.banner.result } = {
      value: null,
    }
    await act(async () => {
      captured.value = await result.current.banner.run({ prompt: 'a fox' })
    })

    expect(captured.value).toBe('u')
    expect(result.current.banner.result).toBe('u')
  })
})
