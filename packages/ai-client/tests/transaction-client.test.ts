import { describe, expect, expectTypeOf, it } from 'vitest'
import { chat, toolDefinition } from '@tanstack/ai'
import { chatVerb, defineTransaction, verb } from '@tanstack/ai/transaction'
import { z } from 'zod'
import { TransactionClient } from '../src/transaction-client.js'
import { fetchServerSentEvents } from '../src/connection-adapters.js'
import type { AnyTextAdapter } from '@tanstack/ai'
import type {
  TransactionSubRun,
  TransactionSystem,
} from '../src/transaction-types.js'

// Declared, never executed — used only inside chat callbacks that the type
// tests never invoke (`defineTransaction` only runs `Object.keys`). Ambient,
// so it emits no runtime binding and is never read.
declare const adapter: AnyTextAdapter

const emptyChatVerb = () => chatVerb(async function* () {} as any)

describe('TransactionClient', () => {
  it('creates one sub-client per declared verb, by kind', () => {
    const txn = defineTransaction({
      primaryChat: emptyChatVerb(),
      banner: verb({ execute: async () => ({ url: 'x' }) }),
    })
    const client = new TransactionClient({
      transaction: txn,
      connection: fetchServerSentEvents('/api/transaction'),
    })

    expect(client.has('primaryChat')).toBe(true)
    expect(client.has('banner')).toBe(true)
    expect(client.has('speech')).toBe(false)
    expect(client.chat('primaryChat')).toBeDefined()
    expect(client.oneShot('banner')).toBeDefined()
    expect(client.chat('banner')).toBeUndefined()
    expect(client.oneShot('primaryChat')).toBeUndefined()
    expect(client.verbs).toEqual(['primaryChat', 'banner'])
  })

  it('supports multiple chat verbs, each with its own ChatClient', () => {
    const txn = defineTransaction({
      primaryChat: emptyChatVerb(),
      summaryChat: emptyChatVerb(),
    })
    const client = new TransactionClient({
      transaction: txn,
      connection: fetchServerSentEvents('/api/transaction'),
    })

    expect(client.chat('primaryChat')).toBeDefined()
    expect(client.chat('summaryChat')).toBeDefined()
    expect(client.chat('primaryChat')).not.toBe(client.chat('summaryChat'))
  })

  it('dispose() tears down every sub-client', () => {
    const txn = defineTransaction({
      primaryChat: emptyChatVerb(),
      banner: verb({ execute: async () => ({}) }),
      narration: verb({ execute: async () => ({}) }),
    })
    const client = new TransactionClient({
      transaction: txn,
      connection: fetchServerSentEvents('/api/transaction'),
    })

    const disposed: Array<string> = []
    client.chat('primaryChat')!.dispose = () => {
      disposed.push('primaryChat')
    }
    client.oneShot('banner')!.dispose = () => {
      disposed.push('banner')
    }
    client.oneShot('narration')!.dispose = () => {
      disposed.push('narration')
    }

    client.dispose()

    expect(disposed.sort()).toEqual(['banner', 'narration', 'primaryChat'])
  })

  it('demuxes transaction sub-run events into per-verb state', () => {
    const banner = verb({ execute: async () => ({ url: 'x' }) })
    const txn = defineTransaction({
      banner,
      blogPost: verb({
        execute: async (_r, ctx) => ctx.call(banner, undefined as never),
      }),
    })
    const changes: Array<Array<TransactionSubRun>> = []
    const client = new TransactionClient({
      transaction: txn,
      connection: fetchServerSentEvents('/api/transaction'),
      callbacks: {
        oneShot: (verbName) =>
          verbName === 'blogPost'
            ? { onSubRunsChange: (s) => changes.push(s) }
            : {},
      },
    })

    // Drive the demux directly through the GenerationClient's onChunk hook,
    // simulating the server's event order.
    const onChunk = (chunk: any) =>
      (client as any).handleSubRunChunk(
        'blogPost',
        chunk,
        changes.length >= 0 ? (s: any) => changes.push(s) : undefined,
      )

    onChunk({ type: 'RUN_STARTED', runId: 'r1', threadId: 't1' })
    onChunk({
      type: 'CUSTOM',
      name: 'transaction:sub-run:started',
      value: { runId: 'r1-sub-0', parentRunId: 'r1', verb: 'banner', index: 0 },
    })
    onChunk({
      type: 'CUSTOM',
      name: 'transaction:sub-run:chunk',
      value: {
        runId: 'r1-sub-0',
        verb: 'banner',
        index: 0,
        chunk: { type: 'TEXT_MESSAGE_CONTENT', delta: 'Hel' },
      },
    })
    onChunk({
      type: 'CUSTOM',
      name: 'transaction:sub-run:chunk',
      value: {
        runId: 'r1-sub-0',
        verb: 'banner',
        index: 0,
        chunk: { type: 'TEXT_MESSAGE_CONTENT', delta: 'lo' },
      },
    })
    onChunk({
      type: 'CUSTOM',
      name: 'transaction:sub-run:result',
      value: {
        runId: 'r1-sub-0',
        verb: 'banner',
        index: 0,
        result: { url: 'img' },
      },
    })

    const subRuns = client.getSubRuns('blogPost')
    expect(subRuns).toHaveLength(1)
    expect(subRuns[0]).toMatchObject({
      runId: 'r1-sub-0',
      verb: 'banner',
      index: 0,
      status: 'success',
      result: { url: 'img' },
      text: 'Hello',
    })

    // A new root run resets the sub-run state.
    onChunk({ type: 'RUN_STARTED', runId: 'r2', threadId: 't1' })
    expect(client.getSubRuns('blogPost')).toHaveLength(0)
  })

  it('marks a sub-run errored on the error event', () => {
    const txn = defineTransaction({
      blogPost: verb({ execute: async () => ({}) }),
    })
    const client = new TransactionClient({
      transaction: txn,
      connection: fetchServerSentEvents('/api/transaction'),
    })
    const onChunk = (chunk: any) =>
      (client as any).handleSubRunChunk('blogPost', chunk, undefined)

    onChunk({ type: 'RUN_STARTED', runId: 'r1', threadId: 't1' })
    onChunk({
      type: 'CUSTOM',
      name: 'transaction:sub-run:started',
      value: { runId: 'r1-sub-0', parentRunId: 'r1', verb: 'banner', index: 0 },
    })
    onChunk({
      type: 'CUSTOM',
      name: 'transaction:sub-run:error',
      value: { runId: 'r1-sub-0', verb: 'banner', index: 0, message: 'nope' },
    })

    expect(client.getSubRuns('blogPost')[0]).toMatchObject({
      status: 'error',
      error: 'nope',
    })
  })

  it('parses a structured chat sub-run into a live `partial`', () => {
    const txn = defineTransaction({
      blogPost: verb({ execute: async () => ({}) }),
    })
    const client = new TransactionClient({
      transaction: txn,
      connection: fetchServerSentEvents('/api/transaction'),
    })
    const onChunk = (chunk: any) =>
      (client as any).handleSubRunChunk('blogPost', chunk, undefined)
    const chunkEvent = (inner: any) =>
      onChunk({
        type: 'CUSTOM',
        name: 'transaction:sub-run:chunk',
        value: { runId: 'r1-sub-0', verb: 'drafting', index: 0, chunk: inner },
      })

    onChunk({ type: 'RUN_STARTED', runId: 'r1', threadId: 't1' })
    onChunk({
      type: 'CUSTOM',
      name: 'transaction:sub-run:started',
      value: {
        runId: 'r1-sub-0',
        parentRunId: 'r1',
        verb: 'drafting',
        index: 0,
      },
    })

    // The structured output streams as partial JSON via TEXT_MESSAGE_CONTENT.
    chunkEvent({ type: 'TEXT_MESSAGE_CONTENT', delta: '{"title":"Sour' })
    expect(client.getSubRuns('blogPost')[0]?.partial).toEqual({ title: 'Sour' })

    chunkEvent({
      type: 'TEXT_MESSAGE_CONTENT',
      delta: 'dough","body":"Once upon',
    })
    expect(client.getSubRuns('blogPost')[0]?.partial).toEqual({
      title: 'Sourdough',
      body: 'Once upon',
    })

    // The terminal event snaps `partial` to the fully-validated object.
    chunkEvent({
      type: 'CUSTOM',
      name: 'structured-output.complete',
      value: { object: { title: 'Sourdough', body: 'Once upon a loaf.' } },
    })
    expect(client.getSubRuns('blogPost')[0]?.partial).toEqual({
      title: 'Sourdough',
      body: 'Once upon a loaf.',
    })
  })

  it('leaves `partial` unset for a plain-text (prose) chat sub-run', () => {
    const txn = defineTransaction({
      blogPost: verb({ execute: async () => ({}) }),
    })
    const client = new TransactionClient({
      transaction: txn,
      connection: fetchServerSentEvents('/api/transaction'),
    })
    const onChunk = (chunk: any) =>
      (client as any).handleSubRunChunk('blogPost', chunk, undefined)

    onChunk({ type: 'RUN_STARTED', runId: 'r1', threadId: 't1' })
    onChunk({
      type: 'CUSTOM',
      name: 'transaction:sub-run:started',
      value: {
        runId: 'r1-sub-0',
        parentRunId: 'r1',
        verb: 'support',
        index: 0,
      },
    })
    onChunk({
      type: 'CUSTOM',
      name: 'transaction:sub-run:chunk',
      value: {
        runId: 'r1-sub-0',
        verb: 'support',
        index: 0,
        chunk: {
          type: 'TEXT_MESSAGE_CONTENT',
          delta: 'Hello, how can I help?',
        },
      },
    })

    const sub = client.getSubRuns('blogPost')[0]
    expect(sub?.text).toBe('Hello, how can I help?')
    expect(sub?.partial).toBeUndefined()
  })
})

describe('TransactionSystem typing', () => {
  it('exposes only declared verbs, typed by kind', () => {
    const txn = defineTransaction({
      primaryChat: emptyChatVerb(),
      banner: verb({
        input: z.object({ prompt: z.string() }),
        execute: async ({ input }) => ({ url: `img:${input.prompt}` }),
      }),
    })
    type Sys = TransactionSystem<typeof txn>
    expectTypeOf<Sys>().toHaveProperty('primaryChat')
    expectTypeOf<Sys>().toHaveProperty('banner')
    // @ts-expect-error speech was not declared
    expectTypeOf<Sys>().toHaveProperty('speech')

    // One-shot input comes from the verb's schema; result from execute.
    expectTypeOf<Parameters<Sys['banner']['run']>[0]>().toEqualTypeOf<{
      prompt: string
    }>()
    expectTypeOf<Sys['banner']['result']>().toEqualTypeOf<{
      url: string
    } | null>()
    expectTypeOf<Sys['banner']['subRuns']>().toEqualTypeOf<
      Array<TransactionSubRun>
    >()
  })

  it('chat verb tools narrow that surface message tool-call parts', () => {
    const weatherDef = toolDefinition({
      name: 'get_weather',
      description: 'Get the weather for a city',
      inputSchema: z.object({ city: z.string() }),
      outputSchema: z.object({ tempC: z.number() }),
    })

    const txn = defineTransaction({
      primaryChat: chatVerb((req) =>
        chat({ adapter, messages: req.messages, tools: [weatherDef] }),
      ),
    })

    type Sys = TransactionSystem<typeof txn>
    type Part = Sys['primaryChat']['messages'][number]['parts'][number]
    type WeatherCall = Extract<Part, { type: 'tool-call'; name: 'get_weather' }>

    expectTypeOf<WeatherCall['name']>().toEqualTypeOf<'get_weather'>()
    expectTypeOf<WeatherCall['input']>().toEqualTypeOf<
      { city: string } | undefined
    >()
    expectTypeOf<WeatherCall['output']>().toEqualTypeOf<
      { tempC: number } | undefined
    >()
  })

  it('outputSchema adds typed partial/final to that chat surface only', () => {
    const outputSchema = z.object({ answer: z.string(), score: z.number() })

    const txn = defineTransaction({
      drafting: chatVerb((req) =>
        chat({ adapter, messages: req.messages, outputSchema, stream: true }),
      ),
      support: chatVerb((req) => chat({ adapter, messages: req.messages })),
    })

    type Drafting = TransactionSystem<typeof txn>['drafting']
    type Support = TransactionSystem<typeof txn>['support']

    expectTypeOf<Drafting['final']>().toEqualTypeOf<{
      answer: string
      score: number
    } | null>()
    expectTypeOf<Drafting['partial']>().toEqualTypeOf<{
      answer?: string
      score?: number
    }>()

    // @ts-expect-error no outputSchema → no `partial` on this chat surface
    expectTypeOf<Support>().toHaveProperty('partial')
    // @ts-expect-error no outputSchema → no `final` on this chat surface
    expectTypeOf<Support>().toHaveProperty('final')
  })
})
