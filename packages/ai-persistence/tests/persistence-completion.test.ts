import { describe, expect, it, vi } from 'vitest'
import {
  DetachableRunCapability,
  EventType,
  chat,
  defineChatMiddleware,
  provideDetachableRun,
} from '@tanstack/ai'
import type { AnyTextAdapter, ModelMessage, StreamChunk } from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'
import {
  PersistenceCompletionCapability,
  getPersistenceCompletion,
} from '../src/capabilities'

function mockAdapter(chunks: Array<StreamChunk>) {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {
      providerOptions: undefined,
      inputModalities: undefined,
      messageMetadataByModality: undefined,
      toolCapabilities: undefined,
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    chatStream: () =>
      (async function* () {
        for (const chunk of chunks) yield chunk
      })(),
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } satisfies AnyTextAdapter
}

function waitingAdapter(signal: AbortSignal) {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {
      providerOptions: undefined,
      inputModalities: undefined,
      messageMetadataByModality: undefined,
      toolCapabilities: undefined,
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
    },
    chatStream: () =>
      (async function* () {
        yield {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: 1,
        }
        await new Promise<void>((resolve) =>
          signal.addEventListener('abort', () => resolve(), { once: true }),
        )
      })(),
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } satisfies AnyTextAdapter
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  for await (const _chunk of stream) {
    // Drain terminal middleware hooks.
  }
}

async function nextEventLoopTurn() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function createCompletionConsumer() {
  let completion: ReturnType<typeof getPersistenceCompletion> | undefined
  let resolveSetup: (() => void) | undefined
  const setupReady = new Promise<void>((resolve) => {
    resolveSetup = resolve
  })
  const consumer = defineChatMiddleware({
    name: 'completion-consumer',
    requires: [PersistenceCompletionCapability],
    setup(ctx) {
      completion = getPersistenceCompletion(ctx)
      resolveSetup?.()
    },
  })
  return { completion: () => completion, consumer, setupReady }
}

function createCompletionRun(
  persistence: ReturnType<typeof memoryPersistence>,
  input: {
    adapter: AnyTextAdapter
    messages: Array<ModelMessage>
    runId: string
    threadId: string
    resume?: Parameters<typeof chat>[0]['resume']
    abortController?: AbortController
    middleware?: Parameters<typeof chat>[0]['middleware']
  },
) {
  const completionSetup = createCompletionConsumer()
  const run = collect(
    chat({
      ...input,
      middleware: [
        withPersistence(persistence),
        ...(input.middleware ?? []),
        completionSetup.consumer,
      ],
    }),
  )
  return { ...completionSetup, run }
}

function requireCompletion(
  completion: ReturnType<typeof getPersistenceCompletion> | undefined,
) {
  if (!completion) throw new Error('Completion middleware was not initialized')
  return completion
}

function requireValue<T>(value: T | undefined) {
  if (value === undefined)
    throw new Error('Expected test value to be initialized')
  return value
}

const detachableProvider = defineChatMiddleware({
  name: 'detachable-provider',
  provides: [DetachableRunCapability],
  setup(ctx) {
    provideDetachableRun(ctx, true)
  },
})

describe('PersistenceCompletionCapability', () => {
  function finishedChunks(): Array<StreamChunk> {
    return [
      {
        type: EventType.RUN_STARTED,
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: 1,
      },
      {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'assistant-1',
        role: 'assistant',
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: 2,
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'assistant-1',
        delta: 'done',
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: 3,
      },
      {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'assistant-1',
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: 4,
      },
      {
        type: EventType.RUN_FINISHED,
        runId: 'run-1',
        threadId: 'thread-1',
        finishReason: 'stop',
        timestamp: 5,
      },
    ]
  }

  it('resolves only after final transcript persistence succeeds', async () => {
    const persistence = memoryPersistence()
    let resolveSave: (() => void) | undefined
    const saved = new Promise<void>((resolve) => {
      resolveSave = resolve
    })
    let saveCount = 0
    const originalSave = persistence.stores.messages.saveThread.bind(
      persistence.stores.messages,
    )
    persistence.stores.messages.saveThread = async (...args) => {
      saveCount += 1
      if (saveCount > 1) {
        await saved
      }
      await originalSave(...args)
    }

    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter: mockAdapter(finishedChunks()),
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'run-1',
      threadId: 'thread-1',
    })

    await setupReady
    expect(completion).toBeDefined()
    let settled = false
    const waiting = completion()
      ?.waitForRunCompletion()
      .then(() => {
        settled = true
      })
    await Promise.resolve()
    expect(settled).toBe(false)

    resolveSave?.()
    await run
    await waiting
    expect(settled).toBe(true)
  })

  it('rejects with the original final persistence error', async () => {
    const persistence = memoryPersistence()
    const failure = new Error('final transcript failed')
    persistence.stores.messages.saveThread = async () => {
      throw failure
    }
    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter: mockAdapter([
        {
          type: EventType.RUN_STARTED,
          runId: 'run-1',
          threadId: 'thread-1',
          timestamp: 1,
        },
        {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          finishReason: 'stop',
          timestamp: 2,
        },
      ]),
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'run-1',
      threadId: 'thread-1',
    })
    await setupReady
    await run.catch(() => undefined)

    await expect(completion()?.waitForRunCompletion()).rejects.toBe(failure)
  })

  it('rejects when the initial save succeeds but the final save fails', async () => {
    const persistence = memoryPersistence()
    const failure = new Error('final save failed')
    let saves = 0
    persistence.stores.messages.saveThread = async (...args) => {
      saves += 1
      if (saves === 2) throw failure
      await memoryPersistence().stores.messages.saveThread(...args)
    }
    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter: mockAdapter(finishedChunks()),
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'run-1',
      threadId: 'thread-1',
    })
    await setupReady
    await run.catch(() => undefined)
    await expect(completion()?.waitForRunCompletion()).rejects.toBe(failure)
  })

  it('does not clone or freeze arbitrary message metadata', async () => {
    const persistence = memoryPersistence()
    const metadata = new Map([['kind', 'typed']])
    const providerBytes = new Uint8Array([1, 2, 3])
    const saved: Array<Array<ModelMessage>> = []
    const originalSave = persistence.stores.messages.saveThread.bind(
      persistence.stores.messages,
    )
    persistence.stores.messages.saveThread = async (threadId, messages) => {
      saved.push(messages)
      await originalSave(threadId, messages)
    }
    const { completion, run } = createCompletionRun(persistence, {
      adapter: mockAdapter(finishedChunks()),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              content: 'hi',
              metadata: { metadata, providerBytes },
            },
          ],
        },
      ],
      runId: 'run-1',
      threadId: 'thread-1',
    })
    await run
    await requireCompletion(completion()).waitForRunCompletion()
    const savedMessage = saved.at(-1)?.[0]
    expect(savedMessage).toBeDefined()
    expect(savedMessage).toMatchObject({
      content: [{ metadata: { metadata, providerBytes } }],
    })
    expect(savedMessage?.content).toBeDefined()
    expect(metadata.get('kind')).toBe('typed')
    providerBytes[0] = 9
    const firstContent = savedMessage?.content?.[0]
    if (typeof firstContent === 'string' || firstContent === undefined)
      throw new Error('expected content part')
    expect(firstContent.metadata).toMatchObject({ providerBytes })
  })

  it('handles completion rejection when the caller does not await it', async () => {
    const persistence = memoryPersistence()
    const failure = new Error('unhandled completion')
    persistence.stores.messages.saveThread = async () => {
      throw failure
    }
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      await collect(
        chat({
          adapter: mockAdapter(finishedChunks()),
          messages: [{ role: 'user', content: 'hi' }],
          runId: 'run-1',
          threadId: 'thread-1',
          middleware: [withPersistence(persistence)],
        }),
      ).catch(() => undefined)
      await nextEventLoopTurn()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  // These cases are kept as separate tests because each deferred terminal
  // write is a distinct completion barrier.  The detailed race setup lives in
  // the lifecycle tests; keeping the names here makes the capability contract
  // explicit at its public boundary.
  it('keeps success pending while completeRun is pending', async () => {
    const persistence = memoryPersistence()
    const runs = requireValue(persistence.stores.runs)
    let releaseUpdate: (() => void) | undefined
    const updateBlocked = new Promise<void>((resolve) => {
      releaseUpdate = resolve
    })
    const originalUpdate = runs.update.bind(runs)
    runs.update = async (...args) => {
      await updateBlocked
      await originalUpdate(...args)
    }
    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter: mockAdapter(finishedChunks()),
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'run-1',
      threadId: 'thread-1',
    })
    await setupReady
    let settled = false
    const waiting = requireCompletion(completion())
      .waitForRunCompletion()
      .then(() => {
        settled = true
      })
    await Promise.resolve()
    expect(settled).toBe(false)
    requireValue(releaseUpdate)()
    await run
    await waiting
    expect(settled).toBe(true)
  })

  it('keeps success pending while commitPendingResumes is pending', async () => {
    const persistence = memoryPersistence()
    await requireValue(persistence.stores.interrupts).create({
      interruptId: 'interrupt-1',
      runId: 'run-1',
      threadId: 'thread-1',
      requestedAt: 1,
      payload: { reason: 'approval_required' },
    })
    const interrupts = requireValue(persistence.stores.interrupts)
    let releaseResolve: (() => void) | undefined
    const resolveBlocked = new Promise<void>((resolve) => {
      releaseResolve = resolve
    })
    const originalResolve = interrupts.resolve.bind(interrupts)
    interrupts.resolve = async (...args) => {
      await resolveBlocked
      await originalResolve(...args)
    }
    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter: mockAdapter(finishedChunks()),
      messages: [],
      runId: 'run-1',
      threadId: 'thread-1',
      resume: [{ interruptId: 'interrupt-1', status: 'resolved', payload: {} }],
    })
    await setupReady
    let settled = false
    const waiting = requireCompletion(completion())
      .waitForRunCompletion()
      .then(() => {
        settled = true
      })
    await Promise.resolve()
    expect(settled).toBe(false)
    requireValue(releaseResolve)()
    await run
    await waiting
    expect(settled).toBe(true)
  })
  it('keeps error pending while failRun is pending, then rejects the same error', async () => {
    const persistence = memoryPersistence()
    const failure = new Error('provider failed')
    const runs = requireValue(persistence.stores.runs)
    let releaseUpdate: (() => void) | undefined
    const updateBlocked = new Promise<void>((resolve) => {
      releaseUpdate = resolve
    })
    const originalUpdate = runs.update.bind(runs)
    runs.update = async (...args) => {
      await updateBlocked
      await originalUpdate(...args)
    }
    const adapter = mockAdapter([])
    adapter.chatStream = () =>
      (async function* () {
        yield* []
        throw failure
      })()
    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'run-1',
      threadId: 'thread-1',
    })
    await setupReady
    const waiting = requireCompletion(completion()).waitForRunCompletion()
    let settled = false
    void waiting.catch(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    requireValue(releaseUpdate)()
    await expect(run).rejects.toBe(failure)
    await expect(waiting).rejects.toBe(failure)
  })

  it('rejects the same error when the terminal error write fails', async () => {
    const persistence = memoryPersistence()
    const failure = new Error('provider failed')
    const terminalFailure = new Error('failed to persist error status')
    requireValue(persistence.stores.runs).update = async () => {
      throw terminalFailure
    }
    const adapter = mockAdapter([])
    adapter.chatStream = () =>
      (async function* () {
        yield* []
        throw failure
      })()
    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'run-1',
      threadId: 'thread-1',
    })
    await setupReady
    await expect(run).rejects.toBe(failure)
    await expect(
      requireCompletion(completion()).waitForRunCompletion(),
    ).rejects.toBe(failure)
  })
  it('keeps abort pending while the abort status write is pending, then rejects the same reason', async () => {
    const persistence = memoryPersistence()
    const runs = requireValue(persistence.stores.runs)
    const reason = 'caller stopped'
    const controller = new AbortController()
    let releaseUpdate: (() => void) | undefined
    const updateBlocked = new Promise<void>((resolve) => {
      releaseUpdate = resolve
    })
    const originalUpdate = runs.update.bind(runs)
    runs.update = async (...args) => {
      await updateBlocked
      await originalUpdate(...args)
    }
    const {
      completion,
      setupReady,
      run: rawRun,
    } = createCompletionRun(persistence, {
      adapter: waitingAdapter(controller.signal),
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'run-1',
      threadId: 'thread-1',
      abortController: controller,
    })
    const run = rawRun.catch(() => undefined)
    await setupReady
    await Promise.resolve()
    controller.abort(reason)
    const waiting = requireCompletion(completion()).waitForRunCompletion()
    let settled = false
    void waiting.catch(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    requireValue(releaseUpdate)()
    await expect(waiting).rejects.toBe(reason)
    await run
  })
  it('rejects the same reason when the initial cancel-status lookup fails', async () => {
    const persistence = memoryPersistence()
    const lookupFailure = new Error('cancel lookup failed')
    requireValue(persistence.stores.runs).get = async () => {
      throw lookupFailure
    }
    const reason = 'caller stopped'
    const controller = new AbortController()
    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter: waitingAdapter(controller.signal),
      messages: [],
      runId: 'run-1',
      threadId: 'thread-1',
      abortController: controller,
    })
    await setupReady
    await Promise.resolve()
    controller.abort(reason)
    await expect(
      requireCompletion(completion()).waitForRunCompletion(),
    ).rejects.toBe(reason)
    await run.catch(() => undefined)
  })

  it('keeps completion pending for a detachable disconnect', async () => {
    const persistence = memoryPersistence()
    const controller = new AbortController()
    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter: waitingAdapter(controller.signal),
      messages: [],
      runId: 'run-1',
      threadId: 'thread-1',
      abortController: controller,
      middleware: [detachableProvider],
    })
    await setupReady
    controller.abort('socket closed')
    await run

    let settled = false
    const waiting = requireCompletion(completion())
      .waitForRunCompletion()
      .then(() => {
        settled = true
      })
    await nextEventLoopTurn()
    expect(settled).toBe(false)
    void waiting
  })

  it('rejects the same reason when the terminal abort write fails', async () => {
    const persistence = memoryPersistence()
    const terminalFailure = new Error('abort write failed')
    requireValue(persistence.stores.runs).update = async () => {
      throw terminalFailure
    }
    const reason = 'caller stopped'
    const controller = new AbortController()
    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter: waitingAdapter(controller.signal),
      messages: [],
      runId: 'run-1',
      threadId: 'thread-1',
      abortController: controller,
    })
    await setupReady
    await Promise.resolve()
    controller.abort(reason)
    await expect(
      requireCompletion(completion()).waitForRunCompletion(),
    ).rejects.toBe(reason)
    await run.catch(() => undefined)
  })
  it('does not produce an unhandled rejection on the error path', async () => {
    const persistence = memoryPersistence()
    const failure = new Error('provider failed')
    const adapter = mockAdapter([])
    adapter.chatStream = () =>
      (async function* () {
        yield* []
        throw failure
      })()
    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'run-1',
      threadId: 'thread-1',
    })
    const unhandled: Array<unknown> = []
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason)
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      await setupReady
      expect(completion).toBeDefined()
      await expect(run).rejects.toBe(failure)
      void requireCompletion(completion()).waitForRunCompletion()
      await nextEventLoopTurn()
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('does not produce an unhandled rejection on the abort path', async () => {
    const persistence = memoryPersistence()
    const reason = 'caller stopped'
    const controller = new AbortController()
    const { completion, setupReady, run } = createCompletionRun(persistence, {
      adapter: waitingAdapter(controller.signal),
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'run-1',
      threadId: 'thread-1',
      abortController: controller,
    })
    const unhandled: Array<unknown> = []
    const onUnhandled = (unhandledReason: unknown): void => {
      unhandled.push(unhandledReason)
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      await setupReady
      controller.abort(reason)
      await Promise.resolve()
      expect(completion).toBeDefined()
      await run
      void requireCompletion(completion()).waitForRunCompletion()
      await nextEventLoopTurn()
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
