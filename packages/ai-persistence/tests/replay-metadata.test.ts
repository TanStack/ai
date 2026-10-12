import { describe, expect, it } from 'vitest'
import {
  chat,
  defineChatMiddleware,
  DetachableRunCapability,
  EventType,
  provideDetachableRun,
  RUN_CANCEL_REASON,
} from '@tanstack/ai'
import type {
  AdapterYieldChunk,
  ModelMessage,
  StreamChunk,
  Tool,
} from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'
import { reconstructChat } from '../src/reconstruct'

const source = { provider: 'custom', api: 'custom-chat', model: 'requested' }

function createMockAdapter(options: {
  chatStreamFn: () => AsyncIterable<AdapterYieldChunk>
}) {
  const base = fakeText({ model: 'test-model' })
  return {
    adapter: {
      ...base,
      '~types': base['~types'],
      chatStream: options.chatStreamFn,
      structuredOutput: base.structuredOutput.bind(base),
    },
  }
}

async function collectChunks(stream: AsyncIterable<StreamChunk>) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

function serverTool(name: string, execute: () => string): Tool {
  return { name, description: name, execute }
}

const ev = {
  runStarted: () => ({
    type: EventType.RUN_STARTED as const,
    runId: 'run-1',
    threadId: 'thread-1',
  }),
  textStart: (messageId = 'msg-1') => ({
    type: EventType.TEXT_MESSAGE_START as const,
    messageId,
    role: 'assistant' as const,
  }),
  textContent: (delta: string, messageId = 'msg-1') => ({
    type: EventType.TEXT_MESSAGE_CONTENT as const,
    messageId,
    delta,
  }),
  toolStart: (toolCallId: string, toolCallName: string) => ({
    type: EventType.TOOL_CALL_START as const,
    toolCallId,
    toolCallName,
  }),
  toolArgs: (toolCallId: string, delta: string) => ({
    type: EventType.TOOL_CALL_ARGS as const,
    toolCallId,
    delta,
  }),
  toolEnd: (toolCallId: string) => ({
    type: EventType.TOOL_CALL_END as const,
    toolCallId,
  }),
  runFinished: (finishReason: 'stop' | 'tool_calls' = 'stop') => ({
    type: EventType.RUN_FINISHED as const,
    runId: 'run-1',
    threadId: 'thread-1',
    metadata: { tanstack: { finishReason } },
  }),
}

function createStore() {
  const persistence = memoryPersistence()
  const messages = persistence.stores.messages
  if (!messages) throw new Error('Memory persistence must provide messages')
  return { persistence, messages }
}

describe('persisted replay metadata', () => {
  it('stores source before finish and response identity before the final save', async () => {
    const { persistence, messages } = createStore()
    let partial: Array<ModelMessage> = []
    let finished: Array<ModelMessage> = []
    const { adapter } = createMockAdapter({
      chatStreamFn: () =>
        (async function* () {
          yield ev.runStarted()
          yield ev.textStart()
          yield ev.textContent('Hello')
          partial = await messages.loadThread('thread-1')
          yield {
            ...ev.runFinished(),
            responseId: 'response-1',
            model: 'resolved',
          }
          finished = await messages.loadThread('thread-1')
        })(),
    })
    await collectChunks(
      chat({
        adapter: { ...adapter, ...source, name: source.provider },
        messages: [],
        threadId: 'thread-1',
        runId: 'run-1',
        middleware: [
          withPersistence(persistence, {
            snapshotStreaming: true,
            snapshotIntervalMs: 0,
          }),
        ],
      }),
    )
    expect(partial[0]?.metadata?.tanstack?.source).toEqual(source)
    expect(partial[0]?.metadata?.tanstack?.responseId).toBeUndefined()
    expect(finished[0]?.metadata?.tanstack).toMatchObject({
      source,
      responseId: 'response-1',
      model: 'resolved',
    })
    const response = await reconstructChat(
      persistence,
      new Request('https://example.com/chat?threadId=thread-1'),
    )
    expect(await response.json()).toMatchObject({
      messages: [
        {
          metadata: {
            tanstack: { source, responseId: 'response-1', model: 'resolved' },
          },
        },
      ],
    })
  })

  it.each(['event', 'throw'] as const)(
    'marks only the existing snapshot on a server %s error',
    async (failure) => {
      const { persistence, messages } = createStore()
      const { adapter } = createMockAdapter({
        chatStreamFn: () =>
          (async function* () {
            yield ev.runStarted()
            yield ev.textStart()
            yield ev.textContent('partial')
            if (failure === 'throw') throw new Error('failed')
            yield { type: EventType.RUN_ERROR, message: 'failed' }
          })(),
      })
      const run = collectChunks(
        chat({
          adapter: { ...adapter, ...source, name: source.provider },
          messages: [],
          threadId: 'thread-1',
          runId: 'run-1',
          middleware: [
            withPersistence(persistence, {
              snapshotStreaming: true,
              snapshotIntervalMs: 0,
            }),
          ],
        }),
      )
      if (failure === 'throw') await expect(run).rejects.toThrow('failed')
      else await run
      const stored = await messages.loadThread('thread-1')
      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({
        content: 'partial',
        metadata: { tanstack: { source, stopReason: 'error' } },
      })
    },
  )

  it('does not create a failed row when no partial snapshot exists', async () => {
    const { persistence, messages } = createStore()
    const { adapter } = createMockAdapter({
      chatStreamFn: () =>
        (async function* () {
          yield ev.runStarted()
          throw new Error('failed')
        })(),
    })
    await expect(
      collectChunks(
        chat({
          adapter,
          messages: [],
          threadId: 'thread-1',
          runId: 'run-1',
          middleware: [
            withPersistence(persistence, {
              snapshotStreaming: true,
              snapshotIntervalMs: 0,
            }),
          ],
        }),
      ),
    ).rejects.toThrow('failed')
    expect(await messages.loadThread('thread-1')).toEqual([])
  })

  it.each([
    { detachable: false, reason: undefined, expected: 'aborted' },
    { detachable: true, reason: RUN_CANCEL_REASON, expected: 'aborted' },
    { detachable: true, reason: undefined, expected: undefined },
  ] as const)(
    'keeps terminal abort separate from DETACH: $detachable / $reason',
    async ({ detachable, reason, expected }) => {
      const { persistence, messages } = createStore()
      const controller = new AbortController()
      const { adapter } = createMockAdapter({
        chatStreamFn: () =>
          (async function* () {
            yield ev.runStarted()
            yield ev.textStart()
            yield ev.textContent('partial')
            controller.abort(reason)
          })(),
      })
      const detachableMiddleware = defineChatMiddleware({
        name: 'detachable',
        provides: [DetachableRunCapability],
        setup(ctx) {
          provideDetachableRun(ctx, true)
        },
      })
      const persistenceMiddleware = withPersistence(persistence, {
        snapshotStreaming: true,
        snapshotIntervalMs: 0,
      })
      const options = {
        adapter: { ...adapter, ...source, name: source.provider },
        messages: [],
        threadId: 'thread-1',
        runId: 'run-1',
        abortController: controller,
      }
      await collectChunks(
        detachable
          ? chat({
              ...options,
              middleware: [detachableMiddleware, persistenceMiddleware],
            })
          : chat({ ...options, middleware: [persistenceMiddleware] }),
      )
      const stored = await messages.loadThread('thread-1')
      expect(stored).toHaveLength(1)
      expect(stored[0]?.metadata?.tanstack?.stopReason).toBe(expected)
      expect(stored[0]?.metadata?.tanstack?.source).toEqual(source)
      expect((await persistence.stores.runs?.get('run-1'))?.status).toBe(
        expected === undefined ? 'running' : 'aborted',
      )
    },
  )

  it.each([false, true])(
    'does not mark an earlier successful call when a later call fails before start: %s',
    async (beforeStart) => {
      const { persistence, messages } = createStore()
      let call = 0
      const { adapter } = createMockAdapter({
        chatStreamFn: () =>
          (async function* () {
            const first = call++ === 0
            if (!first && beforeStart) throw new Error('failed')
            yield ev.runStarted()
            if (first) {
              yield ev.textStart('first')
              yield ev.textContent('first', 'first')
              yield ev.toolStart('call-1', 'inspect')
              yield ev.toolArgs('call-1', '{}')
              yield ev.toolEnd('call-1')
              yield {
                ...ev.runFinished('tool_calls'),
                responseId: 'response-first',
              }
              return
            }
            yield ev.textStart('second')
            yield ev.textContent('partial', 'second')
            throw new Error('failed')
          })(),
      })
      await expect(
        collectChunks(
          chat({
            adapter: { ...adapter, ...source, name: source.provider },
            messages: [],
            threadId: 'thread-1',
            runId: 'run-1',
            tools: [serverTool('inspect', () => 'ok')],
            middleware: [
              withPersistence(persistence, {
                snapshotStreaming: true,
                snapshotIntervalMs: 0,
              }),
            ],
          }),
        ),
      ).rejects.toThrow('failed')
      const assistants = (await messages.loadThread('thread-1')).filter(
        (message) => message.role === 'assistant',
      )
      expect(
        assistants.map((message) => message.metadata?.tanstack?.stopReason),
      ).toEqual(beforeStart ? [undefined] : [undefined, 'error'])
      expect(assistants[0]?.metadata?.tanstack?.responseId).toBe(
        'response-first',
      )
      expect(assistants[1]?.metadata?.tanstack?.responseId).toBeUndefined()
    },
  )
})
