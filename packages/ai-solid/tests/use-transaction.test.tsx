import { renderHook, waitFor } from '@solidjs/testing-library'
import { describe, expect, expectTypeOf, it } from 'vitest'
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

    expect(result.primaryChat).toBeDefined()
    expect(result.primaryChat.sendMessage).toBeDefined()
    expect(result.banner).toBeDefined()
    expect(result.banner.run).toBeDefined()
    expect(result.blogPost).toBeDefined()
    expect((result as any).speech).toBeUndefined()
  })

  it('run() on a one-shot verb populates its result, typed by the schema', async () => {
    const txn = makeTransaction()
    const { result } = renderHook(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    // The input type comes from the verb's schema.
    expectTypeOf(result.banner.run)
      .parameter(0)
      .toEqualTypeOf<{ prompt: string }>()

    expect(result.banner.result).toBeNull()
    expect(result.banner.isLoading).toBe(false)
    expect(result.banner.status).toBe('idle')

    // run() resolves to the fresh result...
    const generated = await result.banner.run({ prompt: 'a fox' })
    expect(generated?.url).toBe('u')

    // ...and the reactive result state is still populated.
    expect(result.banner.result?.url).toBe('u')
    expect(result.banner.status).toBe('success')
    expect(result.banner.isLoading).toBe(false)
  })

  it('sendMessage() on a chat verb populates its messages', async () => {
    const txn = makeTransaction()
    const { result } = renderHook(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    expect(result.primaryChat.messages).toEqual([])

    // With no outputSchema, sendMessage() resolves to the messages array.
    const returned = await result.primaryChat.sendMessage('hi')
    expect(returned.length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(result.primaryChat.messages.length).toBeGreaterThan(0)
    })

    const userMessage = result.primaryChat.messages.find(
      (m) => m.role === 'user',
    )
    expect(userMessage).toBeDefined()
    if (userMessage) {
      expect(userMessage.parts[0]).toEqual({ type: 'text', content: 'hi' })
    }

    const assistantMessage = result.primaryChat.messages.find(
      (m) => m.role === 'assistant',
    )
    expect(assistantMessage).toBeDefined()
    const textPart = assistantMessage?.parts.find((p) => p.type === 'text')
    expect(textPart).toBeDefined()
    expect(textPart?.content).toBe('hello')
  })

  it('surfaces live sub-run state on a transaction run', async () => {
    const txn = makeTransaction()
    const { result } = renderHook(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    await result.blogPost.run({ topic: 'foxes' })

    expect(result.blogPost.result).toEqual({
      title: 'Foxes',
      heroUrl: 'hero.png',
    })
    expect(result.blogPost.subRuns).toHaveLength(1)
    expect(result.blogPost.subRuns[0]).toMatchObject({
      verb: 'banner',
      status: 'success',
      result: { url: 'hero.png' },
    })
    // The sibling banner surface is untouched by the transaction's sub-run.
    expect(result.banner.result).toBeNull()
  })

  it('exposes chat partial/final with cleared defaults on first render', () => {
    const txn = makeTransaction()
    const { result } = renderHook(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    expect((result.primaryChat as any).partial).toEqual({})
    expect((result.primaryChat as any).final).toBeNull()
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
    expectTypeOf(result.banner.result).toEqualTypeOf<string | null>()

    const returned = await result.banner.run({ prompt: 'a fox' })
    expect(returned).toBe('u')
    expect(result.banner.result).toBe('u')
  })

  it('disposes every chat and one-shot sub-client on cleanup', () => {
    const txn = makeTransaction()
    const { result, cleanup } = renderHook(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    expect(result.primaryChat).toBeDefined()
    expect(() => cleanup()).not.toThrow()
  })
})
