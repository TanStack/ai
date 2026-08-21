import { describe, expect, it, vi } from 'vitest'
import {
  EventType,
  chat,
  defineChatMiddleware,
  defineInterrupt,
  generateImage,
} from '@tanstack/ai'
import type {
  AnyTextAdapter,
  GenerationAbortInfo,
  GenerationErrorInfo,
  GenerationMiddlewareContext,
  ImageAdapter,
  StreamChunk,
} from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withPersistence, withGenerationPersistence } from '../src/middleware'
import { composePersistence } from '../src/types'

function mockAdapter(iterations: Array<Array<StreamChunk>>) {
  const calls: Array<unknown> = []
  let i = 0
  const adapter = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream: (opts: unknown) => {
      calls.push(opts)
      const chunks = iterations[i] ?? []
      i++
      return (async function* () {
        for (const c of chunks) yield c
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
  return { adapter, calls }
}

const runStarted = (): StreamChunk => ({
  type: EventType.RUN_STARTED,
  runId: 'r1',
  threadId: 't1',
  timestamp: 1,
})

const interruptFinished = (): StreamChunk => ({
  type: EventType.RUN_FINISHED,
  runId: 'r1',
  threadId: 't1',
  finishReason: 'tool_calls',
  timestamp: 1,
  outcome: {
    type: 'interrupt',
    interrupts: [{ id: 'interrupt-1', reason: 'tool_call', toolCallId: 'tc1' }],
  },
})

const booleanResponseSchema = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate(value: unknown) {
      return typeof value === 'boolean'
        ? { value }
        : { issues: [{ message: 'response must be a boolean' }] }
    },
    jsonSchema: {
      input() {
        return { type: 'boolean' }
      },
    },
  },
} as const

async function collect(stream: AsyncIterable<StreamChunk>) {
  const out: Array<StreamChunk> = []
  for await (const c of stream) out.push(c)
  return out
}

function throwingChatAdapter(thrown: unknown): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {},
    chatStream: () =>
      (async function* () {
        yield runStarted()
        throw thrown
      })(),
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
}

describe('chat persistence error/abort hooks', () => {
  it('marks the run failed when the provider throws mid-stream', async () => {
    const persistence = memoryPersistence()

    await expect(
      collect(
        chat({
          adapter: throwingChatAdapter(new Error('provider exploded')),
          messages: [{ role: 'user', content: 'hi' }],
          runId: 'r1',
          threadId: 't1',
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow('provider exploded')

    const run = await persistence.stores.runs!.get('r1')
    expect(run?.status).toBe('failed')
    expect(run?.error).toEqual({ message: 'provider exploded' })
  })

  it('marks the run failed when the adapter emits RUN_ERROR', async () => {
    const persistence = memoryPersistence()
    const review = defineInterrupt({
      id: 'review',
      responseSchema: booleanResponseSchema,
    })
    const { adapter } = mockAdapter([
      [
        runStarted(),
        {
          type: EventType.RUN_ERROR,
          message: 'provider failed',
          code: 'provider_error',
          timestamp: 1,
        },
      ],
    ])

    const chunks = await collect(
      chat({
        adapter,
        interrupts: [review],
        messages: [{ role: 'user', content: 'hi' }],
        runId: 'r1',
        threadId: 't1',
        middleware: [
          defineChatMiddleware({
            onInterruptBoundary(ctx) {
              if (ctx.phase !== 'afterModel') return
              return {
                interrupts: [
                  review.interrupt({
                    key: 'review',
                    reason: 'review',
                    message: 'Review the response',
                  }),
                ],
              }
            },
          }),
          withPersistence(persistence),
        ],
      }) as AsyncIterable<StreamChunk>,
    )

    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: EventType.RUN_ERROR,
        message: 'provider failed',
        code: 'provider_error',
      }),
    )
    expect(chunks).not.toContainEqual(
      expect.objectContaining({
        type: EventType.RUN_FINISHED,
        outcome: expect.objectContaining({ type: 'interrupt' }),
      }),
    )
    expect(await persistence.stores.runs!.get('r1')).toMatchObject({
      status: 'failed',
      error: { message: 'provider failed', code: 'provider_error' },
    })
  })

  it('preserves known usage when structured-output finalization fails', async () => {
    const persistence = memoryPersistence()
    const usage = {
      promptTokens: 12,
      completionTokens: 4,
      totalTokens: 16,
    }
    const { adapter } = mockAdapter([
      [
        runStarted(),
        {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm1',
          delta: 'draft',
          timestamp: 1,
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'r1',
          threadId: 't1',
          finishReason: 'stop',
          timestamp: 1,
          usage,
        },
      ],
    ])
    adapter.structuredOutput = () =>
      Promise.reject(new Error('finalization failed'))

    const chunks = await collect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'hi' }],
        tools: [
          {
            name: 'search',
            description: 'Search',
            execute: () => ({ hits: [] }),
          },
        ],
        outputSchema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
        },
        stream: true,
        runId: 'r1',
        threadId: 't1',
        middleware: [withPersistence(persistence)],
      }) as AsyncIterable<StreamChunk>,
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: EventType.RUN_ERROR,
        message: 'finalization failed',
      }),
    )

    expect(await persistence.stores.runs!.get('r1')).toMatchObject({
      status: 'failed',
      usage,
    })
  })

  it('coerces a non-Error thrown value into the run error message', async () => {
    const persistence = memoryPersistence()

    await expect(
      collect(
        chat({
          adapter: throwingChatAdapter('string failure'),
          messages: [{ role: 'user', content: 'hi' }],
          runId: 'r1',
          threadId: 't1',
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toBeDefined()

    const run = await persistence.stores.runs!.get('r1')
    expect(run?.status).toBe('failed')
    expect(run?.error).toEqual({ message: 'string failure' })
  })

  it('propagates and does not swallow a store error thrown while recording an interrupt', async () => {
    const base = memoryPersistence()
    const real = base.stores.interrupts!
    const createError = new Error('interrupts.create failed')
    const persistence = composePersistence(base, {
      overrides: {
        interrupts: {
          create: () => Promise.reject(createError),
          resolve: (id, r) => real.resolve(id, r),
          cancel: (id) => real.cancel(id),
          get: (id) => real.get(id),
          list: (t) => real.list(t),
          listPending: (t) => real.listPending(t),
          listByRun: (r) => real.listByRun(r),
          listPendingByRun: (r) => real.listPendingByRun(r),
        },
      },
    })

    await expect(
      collect(
        chat({
          adapter: mockAdapter([[runStarted(), interruptFinished()]]).adapter,
          messages: [{ role: 'user', content: 'hi' }],
          runId: 'r1',
          threadId: 't1',
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow('interrupts.create failed')
  })

  it('leaves the interrupt persisted when the follow-up thread snapshot fails (partial write)', async () => {
    const base = memoryPersistence()
    const realMessages = base.stores.messages!
    const saveError = new Error('saveThread failed')
    const persistence = composePersistence(base, {
      overrides: {
        messages: {
          loadThread: (t) => realMessages.loadThread(t),
          saveThread: () => Promise.reject(saveError),
        },
      },
    })

    await expect(
      collect(
        chat({
          adapter: mockAdapter([[runStarted(), interruptFinished()]]).adapter,
          messages: [{ role: 'user', content: 'hi' }],
          runId: 'r1',
          threadId: 't1',
          middleware: [withPersistence(persistence)],
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow('saveThread failed')

    // The interrupt was created before the failing snapshot, so it survives:
    // recovery/retry can still see the pending interrupt.
    const pending = await base.stores.interrupts!.listPending('t1')
    expect(pending.map((p) => p.interruptId)).toEqual(['interrupt-1'])
  })

  it('marks the run aborted when the chat is aborted', async () => {
    const persistence = memoryPersistence()
    const controller = new AbortController()
    // Adapter that hangs after RUN_STARTED so we can abort mid-stream.
    const adapter = {
      kind: 'text',
      name: 'mock',
      model: 'test-model',
      '~types': {},
      chatStream: () =>
        (async function* () {
          yield runStarted()
          await new Promise<void>((resolve) => {
            controller.signal.addEventListener('abort', () => resolve(), {
              once: true,
            })
          })
        })(),
      structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    } as unknown as AnyTextAdapter

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'abort-run',
      threadId: 't1',
      abortController: controller,
      middleware: [withPersistence(persistence)],
    }) as AsyncIterable<StreamChunk>

    const reader = (async () => {
      try {
        for await (const _ of stream) {
          // drain until abort
        }
      } catch {
        // abort may reject the stream
      }
    })()

    // Let onConfig/onStart establish the run row, then abort.
    await vi.waitFor(async () => {
      const run = await persistence.stores.runs!.get('abort-run')
      expect(run?.status).toBe('running')
    })
    controller.abort()
    await reader

    // Phase 3 Task 6: this used to assert 'interrupted'. That was asserting the
    // bug — 'interrupted' is a human-in-the-loop PAUSE and is NOT terminal, so a
    // cancelled run never reached a terminal status. No durability is wired here,
    // so the run is not detachable and the abort is terminal: 'aborted'.
    const run = await persistence.stores.runs!.get('abort-run')
    expect(run?.status).toBe('aborted')
    expect(run?.finishedAt).toBeTypeOf('number')
  })
})

function imageAdapterThatThrows(thrown: unknown): ImageAdapter<string> {
  return {
    kind: 'image',
    name: 'test-image-provider',
    model: 'test-image-model',
    '~types': {
      providerOptions: {},
      modelProviderOptionsByName: {},
      modelSizeByName: {},
      modelInputModalitiesByName: {},
    },
    generateImages: vi.fn(() => Promise.reject(thrown)),
  }
}

// A generation run is keyed on `runId` (`ctx.runId ?? ctx.requestId`). With no
// runId supplied the auto-generated `requestId` is the runId, so the integration
// tests capture it via a probe middleware, and the direct-drive tests set
// `requestId` to the pre-created job's id.
function generationContext(requestId: string): GenerationMiddlewareContext {
  return {
    requestId,
    activity: 'image',
    provider: 'test',
    model: 'test-model',
    source: 'server',
    createId: (prefix) => `${prefix}-1`,
    context: undefined,
    // Required on the context: middleware registers result transforms by
    // pushing onto it, so a context without the array would silently no-op
    // both the artifact capture and the run-record result write.
    resultTransforms: [],
  }
}

describe('generation persistence error/abort hooks', () => {
  it('marks the job errored when generation throws', async () => {
    const persistence = memoryPersistence()
    let requestId = ''

    await expect(
      generateImage({
        adapter: imageAdapterThatThrows(new Error('image boom')),
        prompt: 'make an image',
        middleware: [
          {
            onStart: (ctx) => {
              requestId = ctx.requestId
            },
          },
          withGenerationPersistence(persistence, { threadId: 'thread-test' }),
        ],
      }),
    ).rejects.toThrow('image boom')

    const job = await persistence.stores.generationRuns.get(requestId)
    expect(job?.status).toBe('failed')
    expect(job?.error).toEqual({ message: 'image boom' })
  })

  it('coerces a non-Error generation failure into the job error message', async () => {
    const persistence = memoryPersistence()
    let requestId = ''

    await expect(
      generateImage({
        adapter: imageAdapterThatThrows('image string failure'),
        prompt: 'make an image',
        middleware: [
          {
            onStart: (ctx) => {
              requestId = ctx.requestId
            },
          },
          withGenerationPersistence(persistence, { threadId: 'thread-test' }),
        ],
      }),
    ).rejects.toBeDefined()

    const job = await persistence.stores.generationRuns.get(requestId)
    expect(job?.status).toBe('failed')
    expect(job?.error).toEqual({ message: 'image string failure' })
  })

  it('marks the job aborted on generation abort', async () => {
    const persistence = memoryPersistence()
    const middleware = withGenerationPersistence(persistence, {
      threadId: 'thread-test',
    })

    await persistence.stores.generationRuns.createOrResume({
      runId: 'req-abort',
      threadId: 'thread-test',
      activity: 'image',
      provider: 'test',
      model: 'test-model',
      startedAt: 1,
    })

    // Drive the abort hook directly: only long-poll activities (video) route
    // through onAbort at runtime, so exercise the handler in isolation.
    const abortInfo: GenerationAbortInfo = {
      duration: 1,
      reason: 'client cancelled',
    }
    await middleware.onAbort?.(generationContext('req-abort'), abortInfo)

    // Phase 3 Task 6: this used to assert 'interrupted', which was asserting the
    // bug. A generation job has no journal to reattach to, so an abort is always
    // terminal for it.
    expect(
      (await persistence.stores.generationRuns.get('req-abort'))?.status,
    ).toBe('aborted')
  })

  it('coerces a non-Error into the job error message via the onError handler', async () => {
    const persistence = memoryPersistence()
    const middleware = withGenerationPersistence(persistence, {
      threadId: 'thread-test',
    })
    await persistence.stores.generationRuns.createOrResume({
      runId: 'req-err',
      threadId: 'thread-test',
      activity: 'image',
      provider: 'test',
      model: 'test-model',
      startedAt: 1,
    })
    const errorInfo: GenerationErrorInfo = {
      error: { code: 500 },
      duration: 1,
    }
    await middleware.onError?.(generationContext('req-err'), errorInfo)

    const job = await persistence.stores.generationRuns.get('req-err')
    expect(job?.status).toBe('failed')
    expect(job?.error).toEqual({ message: '[object Object]' })
  })
})
