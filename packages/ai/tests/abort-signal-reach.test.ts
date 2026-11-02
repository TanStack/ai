/**
 * A cancel (caller signal, timeout, middleware `ctx.abort()`) must reach the
 * provider request, not only the caller. Each fake below rejects at once when
 * it gets no signal, and otherwise hangs until its signal aborts — like a real
 * fetch that keeps running (and billing) until something aborts it.
 */
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { summarize } from '../src/activities/summarize/index'
import { ChatStreamSummarizeAdapter } from '../src/activities/summarize/chat-stream-summarize'
import { generateVideo } from '../src/activities/generateVideo/index'
import { toWebSocketStream } from '../src/stream-to-websocket'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { ChatStreamCapable } from '../src/activities/summarize/chat-stream-summarize'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { WebSocketLike } from '../src/stream-to-websocket'
import type { StreamChunk } from '../src/types'

/** A provider request: no signal fails at once, else hangs until abort. */
function hangUntilAborted(signal: AbortSignal | undefined): Promise<never> {
  if (!signal) {
    return Promise.reject(new Error('request sent without an abort signal'))
  }
  return new Promise((_, reject) => {
    const fail = () =>
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
}

/** 'done' when `work` settles within `ms`, else 'hung'. */
function settlesWithin(work: Promise<unknown>, ms = 500) {
  return Promise.race([
    work.then(
      () => 'done',
      () => 'done',
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve('hung'), ms)),
  ])
}

function summarizeAdapter(seen: { signal?: AbortSignal }) {
  const text: ChatStreamCapable = {
    chatStream: (options) =>
      (async function* () {
        seen.signal = options.request?.signal ?? undefined
        yield* []
        await hangUntilAborted(seen.signal)
      })(),
  }
  return new ChatStreamSummarizeAdapter<string, object>(
    text,
    'test-model',
    'openai',
  )
}

describe('summarize() abort reaches the wrapped chatStream', () => {
  it('non-stream: caller abort aborts the request (C1)', async () => {
    const seen: { signal?: AbortSignal } = {}
    const controller = new AbortController()
    const run = summarize({
      adapter: summarizeAdapter(seen),
      threadId: 'thread-1',
      text: 'long text',
      abortSignal: controller.signal,
    })
    setTimeout(() => controller.abort(), 10)
    await expect(run).rejects.toThrow()
    expect(seen.signal?.aborted).toBe(true)
  })

  it('stream: caller abort aborts the request (C2)', async () => {
    const seen: { signal?: AbortSignal } = {}
    const controller = new AbortController()
    const stream = summarize({
      adapter: summarizeAdapter(seen),
      threadId: 'thread-1',
      text: 'long text',
      stream: true,
      abortSignal: controller.signal,
    })
    setTimeout(() => controller.abort(), 10)
    await expect(collectChunks(stream)).rejects.toThrow()
    expect(seen.signal?.aborted).toBe(true)
  })

  it('stream: timeout aborts the request (C2)', async () => {
    const seen: { signal?: AbortSignal } = {}
    const stream = summarize({
      adapter: summarizeAdapter(seen),
      threadId: 'thread-1',
      text: 'long text',
      stream: true,
      timeout: 10,
    })
    await expect(collectChunks(stream)).rejects.toThrow()
    expect(seen.signal?.aborted).toBe(true)
  })
})

describe('middleware ctx.abort() reaches the provider', () => {
  it('aborts the chatStream request (C3)', async () => {
    let seen: AbortSignal | undefined
    const { adapter } = createMockAdapter({
      chatStreamFn: (options) =>
        (async function* () {
          seen = options.request?.signal
          yield ev.runStarted()
          // Like a real adapter: a failed request becomes a RUN_ERROR chunk.
          try {
            await hangUntilAborted(seen)
          } catch (error) {
            yield ev.runError((error as Error).message)
          }
        })(),
    })
    const onAbort = vi.fn()
    const onError = vi.fn()
    const middleware: ChatMiddleware = {
      name: 'aborter',
      onStart: (ctx) => {
        setTimeout(() => ctx.abort('stop'), 10)
      },
      onAbort,
      onError,
    }
    const run = collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [middleware],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(await settlesWithin(run)).toBe('done')
    expect(seen?.aborted).toBe(true)
    expect(onAbort).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
  })

  it('aborts the structured output request (C3)', async () => {
    let seen: AbortSignal | undefined
    let abortRun: ((reason?: string) => void) | undefined
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('{}'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
      structuredOutput: (options) => {
        seen = options.chatOptions.request?.signal
        abortRun?.('stop')
        return hangUntilAborted(seen)
      },
    })
    const run = chat({
      threadId: 'thread-1',
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      outputSchema: z.object({ a: z.string() }),
      middleware: [
        {
          name: 'aborter',
          onStart: (ctx) => {
            abortRun = ctx.abort
          },
        },
      ],
    })
    expect(await settlesWithin(run)).toBe('done')
    expect(seen?.aborted).toBe(true)
  })

  it('aborts ctx.signal (C4)', async () => {
    let signal: AbortSignal | undefined
    const { adapter } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished('stop')]],
    })
    await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          {
            name: 'aborter',
            onStart: (ctx) => {
              signal = ctx.signal
              ctx.abort('stop')
            },
          },
        ],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(signal?.aborted).toBe(true)
  })

  it('stops a subagent child (C5)', async () => {
    let outcome = 'running'
    const worker = defineAgent({
      name: 'worker',
      description: 'Waits for a stop',
      run: (ctx) =>
        new Promise<string>((resolve) => {
          ctx.abortSignal?.addEventListener('abort', () => {
            outcome = 'stopped'
            resolve('stopped')
          })
          setTimeout(() => {
            if (outcome === 'running') outcome = 'never stopped'
            resolve('done')
          }, 300)
        }),
    })
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('c1', 'worker'),
          ev.toolArgs('c1', '{}'),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.runFinished('stop')],
      ],
    })
    await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        subagents: { agents: [worker] },
        middleware: [
          {
            name: 'aborter',
            onBeforeToolCall: (ctx) => {
              setTimeout(() => ctx.abort('stop'), 10)
              return undefined
            },
          },
        ],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(outcome).toBe('stopped')
  })

  it('does not wait for a server tool that ignores the signal (C6)', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('c1', 'stuck'),
          ev.toolArgs('c1', '{}'),
          ev.toolEnd('c1', 'stuck', { input: {} }),
          ev.runFinished('tool_calls'),
        ],
      ],
    })
    const run = collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [
          {
            name: 'stuck',
            description: 'Ignores its abort signal',
            execute: () => new Promise(() => {}),
          },
        ],
        middleware: [
          {
            name: 'aborter',
            onBeforeToolCall: (ctx) => {
              setTimeout(() => ctx.abort('stop'), 10)
              return undefined
            },
          },
        ],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(await settlesWithin(run)).toBe('done')
  })
})

describe('generateVideo() polling', () => {
  // `stuck` is the adapter call that hangs while the caller aborts.
  for (const stuck of ['getVideoStatus', 'getVideo'] as const) {
    it(`stops on abort while ${stuck} hangs (C8)`, async () => {
      const controller = new AbortController()
      const hang = () => {
        setTimeout(() => controller.abort(), 10)
        return new Promise<never>(() => {})
      }
      const adapter = {
        kind: 'video' as const,
        name: 'mock',
        model: 'mock-video-model',
        createVideoJob: async () => ({
          jobId: 'job-1',
          model: 'mock-video-model',
        }),
        getVideoStatus: () =>
          stuck === 'getVideoStatus'
            ? hang()
            : Promise.resolve({ status: 'completed' as const }),
        getVideo: () =>
          stuck === 'getVideo'
            ? hang()
            : Promise.resolve({ url: 'https://example.com/v.mp4' }),
      }
      const stream = generateVideo({
        threadId: 'thread-1',
        adapter: adapter as any,
        prompt: 'a cat',
        stream: true,
        pollingInterval: 1,
        abortSignal: controller.signal,
      })
      expect(await settlesWithin(collectChunks(stream))).toBe('done')
    })
  }
})

describe('toWebSocketStream() (non-durable)', () => {
  it('stops pumping a turn after an abort frame (C11)', async () => {
    const sent: Array<string> = []
    const handlers: Record<string, Array<(ev: { data: unknown }) => void>> = {}
    const socket: WebSocketLike = {
      send: (data) => sent.push(data),
      close: () => {},
      addEventListener: (type, handler) => {
        ;(handlers[type] ??= []).push(handler)
      },
    }
    const emit = (data: string) => {
      for (const h of handlers.message ?? []) h({ data })
    }
    let closed = false
    toWebSocketStream(socket, new Request('https://x/api/chat'), {
      // Ignores ctx.signal, like a hand-rolled stream.
      onRun: ({ runId, threadId }): AsyncIterable<StreamChunk> =>
        (async function* () {
          try {
            yield ev.runStarted(runId, threadId)
            await new Promise((resolve) => setTimeout(resolve, 20))
            yield ev.textContent('late')
            await new Promise((resolve) => setTimeout(resolve, 20))
            yield ev.textContent('later')
          } finally {
            closed = true
          }
        })(),
    })
    emit(
      JSON.stringify({
        threadId: 't',
        runId: 'run-1',
        messages: [],
        tools: [],
        context: [],
        forwardedProps: {},
        state: {},
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    emit(JSON.stringify({ type: 'abort', runId: 'run-1' }))
    await new Promise((resolve) => setTimeout(resolve, 80))
    const deltas = sent.map((s) => JSON.parse(s).delta).filter(Boolean)
    expect(deltas).toEqual([])
    expect(closed).toBe(true)
  })
})
