import { describe, expect, expectTypeOf, it } from 'vitest'
import { chatVerb, defineTransaction, verb } from '@tanstack/ai/transaction'
import { stream } from '@tanstack/ai-client'
import { z } from 'zod'
import { createTransaction } from '../src/create-transaction.svelte.js'

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

describe('createTransaction', () => {
  it('exposes only the declared verbs, by kind', () => {
    const txn = makeTransaction()
    const system = createTransaction(txn, { connection: fakeConnection() })

    expect(system.primaryChat).toBeDefined()
    expect(system.primaryChat.sendMessage).toBeDefined()
    expect(system.banner).toBeDefined()
    expect(system.banner.run).toBeDefined()
    expect(system.blogPost).toBeDefined()
    expect((system as any).speech).toBeUndefined()

    system.dispose()
  })

  it('run() on a one-shot verb populates its result, typed by the schema', async () => {
    const txn = makeTransaction()
    const system = createTransaction(txn, { connection: fakeConnection() })

    // The input type comes from the verb's schema.
    expectTypeOf(system.banner.run)
      .parameter(0)
      .toEqualTypeOf<{ prompt: string }>()

    // run() resolves to the fresh result...
    const generated = await system.banner.run({ prompt: 'a fox' })
    expect(generated?.url).toBe('u')

    // ...and the reactive result state is still populated.
    expect(system.banner.result?.url).toBe('u')

    system.dispose()
  })

  it('sendMessage() on a chat verb populates its messages', async () => {
    const txn = makeTransaction()
    const system = createTransaction(txn, { connection: fakeConnection() })

    // With no outputSchema, sendMessage() resolves to the messages array.
    const returned = await system.primaryChat.sendMessage('hi')
    expect(returned.length).toBeGreaterThan(0)

    expect(system.primaryChat.messages.length).toBeGreaterThan(0)

    system.dispose()
  })

  it('surfaces live sub-run state on a transaction run', async () => {
    const txn = makeTransaction()
    const system = createTransaction(txn, { connection: fakeConnection() })

    await system.blogPost.run({ topic: 'foxes' })

    expect(system.blogPost.result).toEqual({
      title: 'Foxes',
      heroUrl: 'hero.png',
    })
    expect(system.blogPost.subRuns).toHaveLength(1)
    expect(system.blogPost.subRuns[0]).toMatchObject({
      verb: 'banner',
      status: 'success',
      result: { url: 'hero.png' },
    })
    // The sibling banner surface is untouched by the transaction's sub-run.
    expect(system.banner.result).toBeNull()

    system.dispose()
  })

  it('exposes chat partial/final with cleared defaults on creation', () => {
    const txn = makeTransaction()
    const system = createTransaction(txn, { connection: fakeConnection() })

    expect((system.primaryChat as any).partial).toEqual({})
    expect((system.primaryChat as any).final).toBeNull()

    system.dispose()
  })

  it('applies a one-shot onResult transform and infers its type', async () => {
    const txn = makeTransaction()
    const system = createTransaction(txn, {
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
    })

    // The surface `result` is the transform's (non-nullish) return type.
    expectTypeOf(system.banner.result).toEqualTypeOf<string | null>()

    const generated = await system.banner.run({ prompt: 'a fox' })
    expect(generated).toBe('u')
    expect(system.banner.result).toBe('u')

    system.dispose()
  })
})
