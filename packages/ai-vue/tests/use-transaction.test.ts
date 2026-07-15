import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { chatVerb, defineTransaction, verb } from '@tanstack/ai/transaction'
import { stream } from '@tanstack/ai-client'
import { z } from 'zod'
import { useTransaction } from '../src/use-transaction.js'

// A connection adapter that replays canned chunks per verb, branching on the
// `verb` discriminator forwarded by TransactionClient — the same way a real
// server handler (`defineTransaction(...).handler`) would route.
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

/**
 * Mount the composable inside a component (the harness style shared by the
 * other ai-vue tests), capturing its return via a closure so the declared
 * `TransactionSystem` typing survives for the type-level assertions. Runtime
 * assertions on reactive fields unwrap the nested refs via `vm` (`as any`),
 * matching the runtime shape the composable actually returns.
 */
function renderUseTransaction<T>(setup: () => T) {
  let system!: T
  const TestComponent = defineComponent({
    setup() {
      system = setup()
      return {}
    },
    template: '<div></div>',
  })

  const wrapper = mount(TestComponent)
  return { wrapper, system, vm: system as any }
}

describe('useTransaction', () => {
  it('exposes only the declared verbs, by kind', () => {
    const txn = makeTransaction()
    const { system, vm } = renderUseTransaction(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    expect(system.primaryChat).toBeDefined()
    expect(system.primaryChat.sendMessage).toBeDefined()
    expect(system.banner).toBeDefined()
    expect(system.banner.run).toBeDefined()
    expect(system.blogPost).toBeDefined()
    expect(vm.speech).toBeUndefined()
  })

  it('run() on a one-shot verb populates its result, typed by the schema', async () => {
    const txn = makeTransaction()
    const { system, vm } = renderUseTransaction(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    // The input type comes from the verb's schema.
    expectTypeOf(system.banner.run)
      .parameter(0)
      .toEqualTypeOf<{ prompt: string }>()

    // run() resolves to the fresh result...
    const returned = await system.banner.run({ prompt: 'a fox' })
    expect(returned?.url).toBe('u')
    await flushPromises()

    // ...and the reactive result ref is still populated.
    expect(vm.banner.result.value).toEqual({ url: 'u' })
    expect(vm.banner.isLoading.value).toBe(false)
    expect(vm.banner.status.value).toBe('success')
  })

  it('sendMessage() on a chat verb populates its messages', async () => {
    const txn = makeTransaction()
    const { system, vm } = renderUseTransaction(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    // With no outputSchema, sendMessage() resolves to the messages array.
    const returned = await system.primaryChat.sendMessage('hi')
    expect(returned.length).toBeGreaterThan(0)
    await flushPromises()

    expect(vm.primaryChat.messages.value.length).toBeGreaterThan(0)
    const assistantMessage = vm.primaryChat.messages.value.find(
      (m: any) => m.role === 'assistant',
    )
    expect(assistantMessage).toBeDefined()
    const textPart = assistantMessage?.parts.find((p: any) => p.type === 'text')
    expect(textPart?.content).toBe('hello')
  })

  it('surfaces live sub-run state on a transaction run', async () => {
    const txn = makeTransaction()
    const { system, vm } = renderUseTransaction(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    await system.blogPost.run({ topic: 'foxes' })
    await flushPromises()

    expect(vm.blogPost.result.value).toEqual({
      title: 'Foxes',
      heroUrl: 'hero.png',
    })
    expect(vm.blogPost.subRuns.value).toHaveLength(1)
    expect(vm.blogPost.subRuns.value[0]).toMatchObject({
      verb: 'banner',
      status: 'success',
      result: { url: 'hero.png' },
    })
    // The sibling banner surface is untouched by the transaction's sub-run.
    expect(vm.banner.result.value).toBeNull()
  })

  it('exposes chat partial/final with cleared defaults on first render', () => {
    const txn = makeTransaction()
    const { vm } = renderUseTransaction(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    expect(vm.primaryChat.partial.value).toEqual({})
    expect(vm.primaryChat.final.value).toBeNull()
  })

  it('applies a one-shot onResult transform and infers its type', async () => {
    const txn = makeTransaction()
    const { system, vm } = renderUseTransaction(() =>
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
    expectTypeOf(system.banner.result).toEqualTypeOf<string | null>()

    const returned = await system.banner.run({ prompt: 'a fox' })
    await flushPromises()

    expect(returned).toBe('u')
    expect(vm.banner.result.value).toBe('u')
  })

  it('disposes the underlying client on unmount without throwing', async () => {
    const txn = makeTransaction()
    const { wrapper, system } = renderUseTransaction(() =>
      useTransaction(txn, { connection: fakeConnection() }),
    )

    await system.primaryChat.sendMessage('hi')
    await flushPromises()

    expect(() => wrapper.unmount()).not.toThrow()
  })
})
