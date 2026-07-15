import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  TRANSACTION_EVENTS,
  chatVerb,
  defineTransaction,
  verb,
} from '../../../src/activities/transaction/index.js'
import type { ChatVerbCallback } from '../../../src/activities/transaction/types.js'
import type { ChatStream } from '../../../src/types.js'

// Compile-only: a streaming chat callback (the shape `chat()` returns by
// default) must be assignable to `ChatVerbCallback` without a cast.
const _chatCbAssignable: ChatVerbCallback = (_req) =>
  undefined as unknown as ChatStream
void _chatCbAssignable

function runAgentBody(verbName: string, extra: Record<string, unknown> = {}) {
  return {
    threadId: 't1',
    runId: 'r1',
    state: {},
    messages: [],
    tools: [],
    context: [],
    forwardedProps: { verb: verbName, ...extra },
  }
}

function req(body: unknown) {
  return new Request('http://x/api/transaction', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readSse(res: Response): Promise<Array<any>> {
  const text = await res.text()
  return text
    .split('\n\n')
    .map((l) => l.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

const emptyChat = () =>
  chatVerb(async function* (r: any) {
    yield {
      type: 'RUN_STARTED',
      threadId: r.threadId,
      runId: r.runId,
    } as any
    yield {
      type: 'RUN_FINISHED',
      threadId: r.threadId,
      runId: r.runId,
    } as any
  } as any)

describe('defineTransaction', () => {
  it('is inert: does not invoke any verb at define time', () => {
    const execute = vi.fn()
    const callback = vi.fn()
    const txn = defineTransaction({
      primaryChat: chatVerb(callback as any),
      banner: verb({ execute }),
    })
    expect(execute).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
    expect(txn.verbs.slice().sort()).toEqual(['banner', 'primaryChat'])
    expect(txn.verbKinds).toEqual({ primaryChat: 'chat', banner: 'one-shot' })
    expect(typeof txn.handler).toBe('function')
  })

  it('is exported from the transaction subpath entry', async () => {
    const mod = await import('../../../src/transaction.js')
    expect(typeof mod.defineTransaction).toBe('function')
    expect(typeof mod.verb).toBe('function')
    expect(typeof mod.chatVerb).toBe('function')
  }, 30000)
})

describe('transaction.handler routing', () => {
  it('400s on an unknown verb', async () => {
    const txn = defineTransaction({ primaryChat: emptyChat() })
    const res = await txn.handler(req(runAgentBody('banner')))
    expect(res.status).toBe(400)
  })

  it('400s on an inherited Object.prototype key used as verb', async () => {
    const txn = defineTransaction({ primaryChat: emptyChat() })
    const res = await txn.handler(req(runAgentBody('toString')))
    expect(res.status).toBe(400)
  })

  it('routes a chat verb and streams the callback iterable', async () => {
    const txn = defineTransaction({ primaryChat: emptyChat() })
    const res = await txn.handler(req(runAgentBody('primaryChat')))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const chunks = await readSse(res)
    expect(chunks[0].type).toBe('RUN_STARTED')
  })

  it('supports multiple independently-routed chat verbs', async () => {
    const seen: Array<string> = []
    const mkChat = (label: string) =>
      chatVerb(async function* (r: any) {
        seen.push(label)
        yield {
          type: 'RUN_STARTED',
          threadId: r.threadId,
          runId: r.runId,
        } as any
      } as any)
    const txn = defineTransaction({
      primaryChat: mkChat('primary'),
      summaryChat: mkChat('summary'),
    })
    await (await txn.handler(req(runAgentBody('summaryChat')))).text()
    expect(seen).toEqual(['summary'])
    await (await txn.handler(req(runAgentBody('primaryChat')))).text()
    expect(seen).toEqual(['summary', 'primary'])
  })
})

describe('one-shot verbs', () => {
  it('wraps the execute result as a generation:result CUSTOM event', async () => {
    const txn = defineTransaction({
      banner: verb({
        input: z.object({ prompt: z.string() }),
        execute: async ({ input }) => ({ url: `generated:${input.prompt}` }),
      }),
    })
    const res = await txn.handler(
      req(runAgentBody('banner', { prompt: 'a fox' })),
    )
    const chunks = await readSse(res)
    expect(chunks[0].type).toBe('RUN_STARTED')
    const custom = chunks.find((c) => c.type === 'CUSTOM')
    expect(custom.name).toBe('generation:result')
    expect(custom.value.url).toBe('generated:a fox')
    expect(chunks.at(-1).type).toBe('RUN_FINISHED')
  })

  it('validates input against the verb schema and 400s with issues', async () => {
    const execute = vi.fn()
    const txn = defineTransaction({
      banner: verb({
        input: z.object({ prompt: z.string() }),
        execute,
      }),
    })
    const res = await txn.handler(
      req(runAgentBody('banner', { prompt: 42 })),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid verb input')
    expect(body.verb).toBe('banner')
    expect(body.issues.length).toBeGreaterThan(0)
    expect(execute).not.toHaveBeenCalled()
  })

  it('gives execute the validated envelope and an abort signal', async () => {
    const txn = defineTransaction({
      echo: verb({
        execute: async (r) => ({
          threadId: r.threadId,
          runId: r.runId,
          state: r.state,
          hasSignal: r.signal instanceof AbortSignal,
          verb: r.forwardedProps.verb,
        }),
      }),
    })
    const body = runAgentBody('echo', { anything: true })
    const chunks = await readSse(await txn.handler(req(body)))
    const custom = chunks.find((c) => c.type === 'CUSTOM')
    expect(custom.value).toEqual({
      threadId: 't1',
      runId: 'r1',
      state: {},
      hasSignal: true,
      verb: 'echo',
    })
  })

  it('emits RUN_ERROR when execute rejects', async () => {
    const txn = defineTransaction({
      boom: verb({
        execute: async () => {
          throw new Error('kaboom')
        },
      }),
    })
    const chunks = await readSse(await txn.handler(req(runAgentBody('boom'))))
    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(error.message).toContain('kaboom')
    expect(chunks.find((c) => c.type === 'RUN_FINISHED')).toBeUndefined()
  })
})

describe('transactions (ctx.call)', () => {
  it('runs sibling one-shot verbs as tagged sub-runs inside one response', async () => {
    const banner = verb({
      input: z.object({ prompt: z.string() }),
      execute: async ({ input }) => ({ url: `img:${input.prompt}` }),
    })
    const txn = defineTransaction({
      banner,
      blogPost: verb({
        input: z.object({ topic: z.string() }),
        execute: async ({ input }, ctx) => {
          const [hero, thumb] = await Promise.all([
            ctx.call(banner, { prompt: `hero ${input.topic}` }),
            ctx.call(banner, { prompt: `thumb ${input.topic}` }),
          ])
          return { hero, thumb }
        },
      }),
    })

    const chunks = await readSse(
      await txn.handler(req(runAgentBody('blogPost', { topic: 'foxes' }))),
    )

    const started = chunks.filter(
      (c) => c.name === TRANSACTION_EVENTS.SUB_RUN_STARTED,
    )
    expect(started).toHaveLength(2)
    expect(started[0].value.verb).toBe('banner')
    expect(started[0].value.parentRunId).toBe('r1')
    expect(started[0].value.runId).not.toBe(started[1].value.runId)

    const results = chunks.filter(
      (c) => c.name === TRANSACTION_EVENTS.SUB_RUN_RESULT,
    )
    expect(results.map((r) => r.value.result.url).sort()).toEqual([
      'img:hero foxes',
      'img:thumb foxes',
    ])

    const final = chunks.find((c) => c.name === 'generation:result')
    expect(final.value).toEqual({
      hero: { url: 'img:hero foxes' },
      thumb: { url: 'img:thumb foxes' },
    })
    expect(chunks.at(-1).type).toBe('RUN_FINISHED')
  })

  it('validates sub-verb input and surfaces a sub-run error + RUN_ERROR', async () => {
    const banner = verb({
      input: z.object({ prompt: z.string() }),
      execute: async () => ({ url: 'never' }),
    })
    const txn = defineTransaction({
      banner,
      bad: verb({
        execute: async (_r, ctx) => ctx.call(banner, { prompt: 42 as any }),
      }),
    })
    const chunks = await readSse(await txn.handler(req(runAgentBody('bad'))))
    const subError = chunks.find(
      (c) => c.name === TRANSACTION_EVENTS.SUB_RUN_ERROR,
    )
    expect(subError.value.verb).toBe('banner')
    expect(chunks.find((c) => c.type === 'RUN_ERROR')).toBeDefined()
  })

  it('collects text and structured output from a chat verb sub-run', async () => {
    const drafting = chatVerb(async function* (r: any) {
      yield { type: 'RUN_STARTED', threadId: r.threadId, runId: r.runId } as any
      yield { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hel' } as any
      yield { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'lo' } as any
      yield {
        type: 'CUSTOM',
        name: 'structured-output.complete',
        value: { object: { title: 'Foxes' }, raw: '{"title":"Foxes"}' },
      } as any
      yield { type: 'RUN_FINISHED', threadId: r.threadId, runId: r.runId } as any
    } as any)
    const txn = defineTransaction({
      drafting,
      blogPost: verb({
        execute: async (_r, ctx) => {
          const draft = await ctx.call(drafting, [
            { role: 'user', content: 'write about foxes' },
          ])
          return draft
        },
      }),
    })
    const chunks = await readSse(
      await txn.handler(req(runAgentBody('blogPost'))),
    )
    const forwarded = chunks.filter(
      (c) => c.name === TRANSACTION_EVENTS.SUB_RUN_CHUNK,
    )
    expect(forwarded.length).toBeGreaterThan(0)
    expect(forwarded[0].value.verb).toBe('drafting')
    const final = chunks.find((c) => c.name === 'generation:result')
    expect(final.value).toEqual({
      text: 'Hello',
      structured: { title: 'Foxes' },
    })
  })
})
