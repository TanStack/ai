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

  it('stream: caller abort reports onAbort, not onError', async () => {
    const onAbort = vi.fn()
    const onError = vi.fn()
    const controller = new AbortController()
    const stream = summarize({
      adapter: summarizeAdapter({}),
      threadId: 'thread-1',
      text: 'long text',
      stream: true,
      abortSignal: controller.signal,
      middleware: [{ name: 'observe', onAbort, onError }],
    })
    setTimeout(() => controller.abort(), 10)
    await expect(collectChunks(stream)).rejects.toThrow()
    expect(onError).not.toHaveBeenCalled()
    expect(onAbort).toHaveBeenCalledTimes(1)
  })

  it('stream: a plain Error after the abort still reports onAbort', async () => {
    // Many SDKs throw a plain Error (no AbortError name) once the request is
    // cancelled, so only the aborted signal shows it was a cancel.
    const text: ChatStreamCapable = {
      chatStream: (options) =>
        (async function* () {
          yield* []
          await hangUntilAborted(options.request?.signal ?? undefined).catch(
            () => {
              throw new Error('socket closed')
            },
          )
        })(),
    }
    const onAbort = vi.fn()
    const onError = vi.fn()
    const controller = new AbortController()
    const stream = summarize({
      adapter: new ChatStreamSummarizeAdapter<string, object>(
        text,
        'test-model',
        'openai',
      ),
      threadId: 'thread-1',
      text: 'long text',
      stream: true,
      abortSignal: controller.signal,
      middleware: [{ name: 'observe', onAbort, onError }],
    })
    setTimeout(() => controller.abort(), 10)
    await expect(collectChunks(stream)).rejects.toThrow()
    expect(onError).not.toHaveBeenCalled()
    expect(onAbort).toHaveBeenCalledTimes(1)
  })

  it('stream: an abort that comes as a RUN_ERROR chunk reports onAbort', async () => {
    // Like openai-base: a failed request becomes a RUN_ERROR chunk.
    const text: ChatStreamCapable = {
      chatStream: (options) =>
        (async function* () {
          yield ev.runStarted()
          try {
            await hangUntilAborted(options.request?.signal ?? undefined)
          } catch {
            yield ev.runError('Request was aborted.')
          }
        })(),
    }
    const onAbort = vi.fn()
    const onFinish = vi.fn()
    const controller = new AbortController()
    const stream = summarize({
      adapter: new ChatStreamSummarizeAdapter<string, object>(
        text,
        'test-model',
        'openai',
      ),
      threadId: 'thread-1',
      text: 'long text',
      stream: true,
      abortSignal: controller.signal,
      middleware: [{ name: 'observe', onAbort, onFinish }],
    })
    setTimeout(() => controller.abort(), 10)
    const chunks = await collectChunks(stream).catch(() => [])
    expect(onFinish).not.toHaveBeenCalled()
    expect(onAbort).toHaveBeenCalledTimes(1)
    // The error chunk still reaches the consumer.
    expect(
      chunks.some(
        (chunk) =>
          chunk.type === 'RUN_ERROR' &&
          chunk.message === 'Request was aborted.',
      ),
    ).toBe(true)
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
        abortController: new AbortController(),
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
      abortController: new AbortController(),
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
        abortController: new AbortController(),
      }) as AsyncIterable<StreamChunk>,
    )
    expect(signal?.aborted).toBe(true)
  })

  it('gives the provider no signal when the caller gives none', async () => {
    // Some SDKs drop their own timeout when a request has a signal.
    let request: unknown = 'not called'
    let ctxSignal: AbortSignal | undefined
    const { adapter } = createMockAdapter({
      chatStreamFn: (options) =>
        (async function* () {
          request = options.request
          yield ev.runStarted()
          yield ev.runFinished('stop')
        })(),
    })
    await collectChunks(
      chat({
        threadId: 'thread-1',
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        middleware: [
          {
            name: 'observe',
            onStart: (ctx) => {
              ctxSignal = ctx.signal
            },
          },
        ],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(request).toBeUndefined()
    expect(ctxSignal).toBeUndefined()
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

  it('starts no download when the caller aborts on the completed status', async () => {
    const controller = new AbortController()
    const getVideo = vi.fn(async () => ({ url: 'https://example.com/v.mp4' }))
    const adapter = {
      kind: 'video' as const,
      name: 'mock',
      model: 'mock-video-model',
      createVideoJob: async () => ({
        jobId: 'job-1',
        model: 'mock-video-model',
      }),
      getVideoStatus: async () => ({ status: 'completed' as const }),
      getVideo,
    }
    const stream = generateVideo({
      threadId: 'thread-1',
      adapter: adapter as any,
      prompt: 'a cat',
      stream: true,
      pollingInterval: 1,
      abortSignal: controller.signal,
    })
    let sawCompleted = false
    // The stream ends the run itself; it may not throw.
    await (async () => {
      for await (const chunk of stream as AsyncIterable<StreamChunk>) {
        if (
          chunk.type === 'CUSTOM' &&
          chunk.name === 'video:status' &&
          (chunk.value as { status?: string }).status === 'completed'
        ) {
          sawCompleted = true
          controller.abort()
        }
      }
    })().catch(() => undefined)
    expect(sawCompleted).toBe(true)
    expect(getVideo).not.toHaveBeenCalled()
  })

  it('cancels the body of a video stream that comes after the abort', async () => {
    const controller = new AbortController()
    const cancel = vi.fn()
    let deliver = () => {}
    const adapter = {
      kind: 'video' as const,
      name: 'mock',
      model: 'mock-video-model',
      createVideoJob: async () => ({
        jobId: 'job-1',
        model: 'mock-video-model',
      }),
      getVideoStatus: async () => ({ status: 'completed' as const }),
      // The download answers only after the caller aborted.
      getVideo: () =>
        new Promise((resolve) => {
          deliver = () =>
            resolve({
              jobId: 'job-1',
              contentType: 'video/mp4',
              body: new ReadableStream({ cancel }),
            })
          setTimeout(() => controller.abort(), 10)
        }),
    }
    const stream = generateVideo({
      threadId: 'thread-1',
      adapter: adapter as any,
      prompt: 'a cat',
      stream: true,
      pollingInterval: 1,
      abortSignal: controller.signal,
    })
    await collectChunks(stream).catch(() => undefined)
    deliver()
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled())
  })
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
