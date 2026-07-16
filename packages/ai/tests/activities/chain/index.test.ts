import { describe, expect, expectTypeOf, it } from 'vitest'
import { EventType } from '@ag-ui/core'
import { CHAIN_EVENTS, chain } from '../../../src/activities/chain/index.js'
import type {
  Chain,
  ChainStepEventValue,
  InferChainInput,
  InferChainOutput,
  ResolveStepResult,
} from '../../../src/activities/chain/index.js'
import type {
  ChatStream,
  StreamChunk,
  StructuredOutputStream,
} from '../../../src/types.js'

interface Draft {
  title: string
  body: string
}

/** Fake `chat({ outputSchema, stream: true })` result: lifecycle + JSON
 *  deltas + structured-output.complete. Cast mirrors the orchestrator's own
 *  `fallbackStructuredOutputStream` construction. */
function fakeStructuredStream(object: Draft): StructuredOutputStream<Draft> {
  return (async function* () {
    yield {
      type: EventType.RUN_STARTED,
      runId: 'inner-run',
      threadId: 'inner-thread',
      timestamp: 1,
    }
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: '{"title":"',
      timestamp: 2,
    }
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: `${object.title}"}`,
      timestamp: 3,
    }
    yield {
      type: EventType.CUSTOM,
      name: 'structured-output.complete',
      value: { object, raw: JSON.stringify(object) },
      timestamp: 4,
    }
    yield {
      type: EventType.RUN_FINISHED,
      runId: 'inner-run',
      threadId: 'inner-thread',
      timestamp: 5,
    }
  })() as StructuredOutputStream<Draft>
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function stepEvents(chunks: Array<StreamChunk>): Array<ChainStepEventValue> {
  return chunks
    .filter((c) => c.type === EventType.CUSTOM && c.name === CHAIN_EVENTS.STEP)
    .map((c) => (c as { value: ChainStepEventValue }).value)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ============================================================================
// Type inference
// ============================================================================

describe('chain type inference', () => {
  it('threads step output to the next step input', () => {
    const c = chain<{ topic: string }>()
      .step('draft', (input) => {
        expectTypeOf(input).toEqualTypeOf<{ topic: string }>()
        return fakeStructuredStream({ title: input.topic, body: 'b' })
      })
      .step('hero', (draft) => {
        // Resolved from StructuredOutputStream<Draft>, not the stream itself
        expectTypeOf(draft).toEqualTypeOf<Draft>()
        return Promise.resolve({ url: draft.title })
      })

    expectTypeOf(c).toEqualTypeOf<Chain<{ topic: string }, { url: string }>>()
    expectTypeOf<InferChainInput<typeof c>>().toEqualTypeOf<{
      topic: string
    }>()
    expectTypeOf<InferChainOutput<typeof c>>().toEqualTypeOf<{ url: string }>()
  })

  it('resolves stream-shaped step results', () => {
    expectTypeOf<
      ResolveStepResult<StructuredOutputStream<Draft>>
    >().toEqualTypeOf<Draft>()
    expectTypeOf<ResolveStepResult<ChatStream>>().toEqualTypeOf<string>()
    expectTypeOf<ResolveStepResult<Promise<number>>>().toEqualTypeOf<number>()
    expectTypeOf<ResolveStepResult<number>>().toEqualTypeOf<number>()
  })

  it('rejects a step whose parameter does not accept the previous output', () => {
    chain<number>()
      .step('double', (n) => n * 2)
      // @ts-expect-error — previous output is number, not string
      .step('shout', (s: string) => s.toUpperCase())
  })

  it('merges parallel branches into a keyed record', () => {
    const c = chain<string>().parallel('fan', {
      upper: (s) => Promise.resolve(s.toUpperCase()),
      length: (s) => s.length,
    })
    expectTypeOf(c).toEqualTypeOf<
      Chain<string, { upper: string; length: number }>
    >()
  })

  it('nests a chain as a typed step', () => {
    const inner = chain<number>().step('double', (n) => n * 2)
    const outer = chain<number>()
      .step(inner.asStep('inner'))
      .step('fmt', (n) => {
        expectTypeOf(n).toEqualTypeOf<number>()
        return `v${n}`
      })
    expectTypeOf<InferChainOutput<typeof outer>>().toEqualTypeOf<string>()
  })
})

// ============================================================================
// Runtime
// ============================================================================

describe('chain.invoke', () => {
  it('runs steps sequentially, feeding outputs to inputs', async () => {
    const result = await chain<number>()
      .step('double', (n) => n * 2)
      .step('fmt', (n) => Promise.resolve(`v${n}`))
      .invoke(3)
    expect(result).toBe('v6')
  })

  it('resolves streaming steps to their structured value', async () => {
    const result = await chain<{ topic: string }>()
      .step('draft', ({ topic }) =>
        fakeStructuredStream({ title: topic, body: 'body' }),
      )
      .step('title', (draft) => draft.title)
      .invoke({ topic: 'foxes' })
    expect(result).toBe('foxes')
  })

  it('rejects with the original step error', async () => {
    const boom = new Error('boom')
    await expect(
      chain<number>()
        .step('explode', () => {
          throw boom
        })
        .invoke(1),
    ).rejects.toBe(boom)
  })
})

describe('chain.stream', () => {
  it('emits one run lifecycle with step events and a final generation:result', async () => {
    const chunks = await collect(
      chain<number>()
        .step('double', (n) => n * 2)
        .step('fmt', (n) => `v${n}`)
        .stream(2),
    )

    expect(chunks[0]?.type).toBe(EventType.RUN_STARTED)
    expect(chunks.at(-1)?.type).toBe(EventType.RUN_FINISHED)

    expect(stepEvents(chunks)).toEqual([
      { step: 'double', index: 0, status: 'started' },
      { step: 'double', index: 0, status: 'done', result: 4 },
      { step: 'fmt', index: 1, status: 'started' },
      { step: 'fmt', index: 1, status: 'done', result: 'v4' },
    ])

    const result = chunks.find(
      (c) => c.type === EventType.CUSTOM && c.name === 'generation:result',
    )
    expect(result).toMatchObject({ value: 'v4' })
  })

  it('forwards streaming step chunks live and strips inner run lifecycle', async () => {
    const chunks = await collect(
      chain<{ topic: string }>()
        .step('draft', ({ topic }) =>
          fakeStructuredStream({ title: topic, body: 'b' }),
        )
        .stream({ topic: 'owls' }),
    )

    // Exactly one RUN_STARTED / RUN_FINISHED — the chain's own.
    expect(chunks.filter((c) => c.type === EventType.RUN_STARTED)).toHaveLength(
      1,
    )
    expect(
      chunks.filter((c) => c.type === EventType.RUN_FINISHED),
    ).toHaveLength(1)

    // Draft deltas forwarded live.
    const deltas = chunks
      .filter((c) => c.type === EventType.TEXT_MESSAGE_CONTENT)
      .map((c) => (c as { delta: string }).delta)
    expect(deltas.join('')).toBe('{"title":"owls"}')

    // structured-output.complete is forwarded too.
    expect(
      chunks.some(
        (c) =>
          c.type === EventType.CUSTOM &&
          c.name === 'structured-output.complete',
      ),
    ).toBe(true)

    const done = stepEvents(chunks).find((e) => e.status === 'done')
    expect(done).toMatchObject({
      step: 'draft',
      result: { title: 'owls', body: 'b' },
    })
  })

  it('runs parallel branches concurrently and merges a keyed record', async () => {
    const order: Array<string> = []
    const chunks = await collect(
      chain<string>()
        .parallel('fan', {
          slow: async (s) => {
            await delay(20)
            order.push('slow')
            return `${s}-slow`
          },
          fast: async (s) => {
            await delay(5)
            order.push('fast')
            return `${s}-fast`
          },
        })
        .step('join', (r) => `${r.fast}|${r.slow}`)
        .stream('x'),
    )

    // fast finished before slow → they actually ran concurrently.
    expect(order).toEqual(['fast', 'slow'])

    const events = stepEvents(chunks)
    expect(events).toContainEqual({
      step: 'fan',
      index: 0,
      branch: 'fast',
      status: 'done',
      result: 'x-fast',
    })
    expect(events).toContainEqual({
      step: 'fan',
      index: 0,
      branch: 'slow',
      status: 'done',
      result: 'x-slow',
    })
    // fast's done event lands before slow's.
    const doneBranches = events
      .filter((e) => e.status === 'done' && e.step === 'fan')
      .map((e) => e.branch)
    expect(doneBranches).toEqual(['fast', 'slow'])

    const result = chunks.find(
      (c) => c.type === EventType.CUSTOM && c.name === 'generation:result',
    )
    expect(result).toMatchObject({ value: 'x-fast|x-slow' })
  })

  it('emits a step error event and RUN_ERROR on failure, skipping later steps', async () => {
    const chunks = await collect(
      chain<number>()
        .step('explode', () => {
          throw new Error('boom')
        })
        .step('after', (n) => n)
        .stream(1),
    )

    expect(stepEvents(chunks)).toEqual([
      { step: 'explode', index: 0, status: 'started' },
      { step: 'explode', index: 0, status: 'error', error: 'boom' },
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      message: 'boom',
    })
    expect(chunks.some((c) => c.type === EventType.RUN_FINISHED)).toBe(false)
  })

  it('ends with RUN_ERROR "Aborted" when the run is aborted mid-step', async () => {
    const abortController = new AbortController()
    const stream = chain<number>()
      .step(
        'hang',
        (_n, ctx) =>
          new Promise<number>((_resolve, reject) => {
            ctx.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      )
      .stream(1, { abortController })

    setTimeout(() => abortController.abort(), 10)
    const chunks = await collect(stream)

    expect(chunks.at(-1)).toMatchObject({
      type: EventType.RUN_ERROR,
      message: 'Aborted',
    })
    // No error step event on abort — the run was cancelled, the step didn't fail.
    expect(stepEvents(chunks).some((e) => e.status === 'error')).toBe(false)
  })

  it('forwards ctx.emit custom events into the combined stream', async () => {
    const chunks = await collect(
      chain<number>()
        .step('report', (n, ctx) => {
          ctx.emit('progress', { pct: 50 })
          return n
        })
        .stream(1),
    )
    expect(
      chunks.find((c) => c.type === EventType.CUSTOM && c.name === 'progress'),
    ).toMatchObject({ value: { pct: 50 } })
  })

  it('nests a chain as a step: inner progress forwarded, single result', async () => {
    const inner = chain<number>().step('double', (n) => n * 2)
    const chunks = await collect(
      chain<number>()
        .step(inner.asStep('inner'))
        .step('fmt', (n) => `v${n}`)
        .stream(1),
    )

    // Inner chain's own step events are forwarded (nested progress).
    expect(stepEvents(chunks)).toEqual([
      { step: 'inner', index: 0, status: 'started' },
      { step: 'double', index: 0, status: 'started' },
      { step: 'double', index: 0, status: 'done', result: 2 },
      { step: 'inner', index: 0, status: 'done', result: 2 },
      { step: 'fmt', index: 1, status: 'started' },
      { step: 'fmt', index: 1, status: 'done', result: 'v2' },
    ])

    // Only the outer chain emits run lifecycle + generation:result.
    expect(chunks.filter((c) => c.type === EventType.RUN_STARTED)).toHaveLength(
      1,
    )
    const results = chunks.filter(
      (c) => c.type === EventType.CUSTOM && c.name === 'generation:result',
    )
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ value: 'v2' })
  })
})
