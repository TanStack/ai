import { describe, expect, it, vi } from 'vitest'
import { EventType, chat, generateImage } from '@tanstack/ai'
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
    expect(run?.error).toBe('provider exploded')
  })

  it('coerces a non-Error thrown value into the run error string', async () => {
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
    expect(run?.error).toBe('string failure')
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

  it('marks the run interrupted when the chat is aborted', async () => {
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

    const run = await persistence.stores.runs!.get('abort-run')
    expect(run?.status).toBe('interrupted')
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

// A generation activity's only identity is `requestId` (auto-generated), so the
// integration tests capture it via a probe middleware, and the direct-drive
// tests set `requestId` to the pre-created run's id.
function generationContext(requestId: string): GenerationMiddlewareContext {
  return {
    requestId,
    activity: 'image',
    provider: 'test',
    model: 'test-model',
    source: 'server',
    createId: (prefix) => `${prefix}-1`,
    context: undefined,
  }
}

describe('generation persistence error/abort hooks', () => {
  it('marks the run failed when generation throws', async () => {
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
          withGenerationPersistence(persistence),
        ],
      }),
    ).rejects.toThrow('image boom')

    const run = await persistence.stores.runs!.get(requestId)
    expect(run?.status).toBe('failed')
    expect(run?.error).toBe('image boom')
  })

  it('coerces a non-Error generation failure into the run error string', async () => {
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
          withGenerationPersistence(persistence),
        ],
      }),
    ).rejects.toBeDefined()

    const run = await persistence.stores.runs!.get(requestId)
    expect(run?.status).toBe('failed')
    expect(run?.error).toBe('image string failure')
  })

  it('marks the run interrupted on generation abort', async () => {
    const persistence = memoryPersistence()
    const middleware = withGenerationPersistence(persistence)

    await persistence.stores.runs!.createOrResume({
      runId: 'req-abort',
      threadId: 'req-abort',
      startedAt: 1,
    })

    // Drive the abort hook directly: only long-poll activities (video) route
    // through onAbort at runtime, so exercise the handler in isolation.
    const abortInfo: GenerationAbortInfo = {
      duration: 1,
      reason: 'client cancelled',
    }
    await middleware.onAbort?.(generationContext('req-abort'), abortInfo)

    expect((await persistence.stores.runs!.get('req-abort'))?.status).toBe(
      'interrupted',
    )
  })

  it('coerces a non-Error into the run error string via the onError handler', async () => {
    const persistence = memoryPersistence()
    const middleware = withGenerationPersistence(persistence)
    await persistence.stores.runs!.createOrResume({
      runId: 'req-err',
      threadId: 'req-err',
      startedAt: 1,
    })
    const errorInfo: GenerationErrorInfo = {
      error: { code: 500 },
      duration: 1,
    }
    await middleware.onError?.(generationContext('req-err'), errorInfo)

    const run = await persistence.stores.runs!.get('req-err')
    expect(run?.status).toBe('failed')
    expect(run?.error).toBe('[object Object]')
  })
})
