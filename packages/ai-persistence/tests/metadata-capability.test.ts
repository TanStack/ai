import { describe, expect, it } from 'vitest'
import {
  EventType,
  MetadataCapability,
  chat,
  defineChatMiddleware,
  getMetadata,
} from '@tanstack/ai'
import type {
  AnyTextAdapter,
  MetadataStore,
  StreamChunk,
} from '@tanstack/ai'
import { memoryPersistence } from '../src/memory'
import { withPersistence } from '../src/middleware'
import { defineAIPersistence, defineMessageStore } from '../src/types'

function mockAdapter() {
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
        } as const
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'run-1',
          threadId: 'thread-1',
          finishReason: 'stop',
          timestamp: 1,
        } as const
      })(),
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  } satisfies AnyTextAdapter
}

async function collect(stream: AsyncIterable<StreamChunk>) {
  for await (const _chunk of stream) {
    // Drain the stream so terminal middleware hooks run.
  }
}

describe('metadata capability', () => {
  it('provides the persistence metadata store before onConfig in either order', async () => {
    const persistence = memoryPersistence()
    let metadata: MetadataStore | undefined
    const consumer = defineChatMiddleware({
      name: 'metadata-consumer',
      optionalRequires: [MetadataCapability],
      onConfig(ctx) {
        metadata = getMetadata(ctx, { optional: true })
      },
    })

    await collect(
      chat({
        adapter: mockAdapter(),
        messages: [{ role: 'user', content: 'hello' }],
        middleware: [consumer, withPersistence(persistence)],
      }),
    )

    expect(metadata).toBe(persistence.stores.metadata)
  })

  it('leaves the capability absent when persistence has no metadata store', async () => {
    const threads = new Map<string, Array<{ role: 'user'; content: string }>>()
    const persistence = defineAIPersistence({
      stores: {
        messages: defineMessageStore({
          loadThread: async (threadId) => threads.get(threadId) ?? [],
          saveThread: async (threadId, messages) => {
            threads.set(
              threadId,
              messages.filter(
                (message): message is { role: 'user'; content: string } =>
                  message.role === 'user' &&
                  typeof message.content === 'string',
              ),
            )
          },
        }),
      },
    })
    let metadata: MetadataStore | undefined
    const consumer = defineChatMiddleware({
      name: 'metadata-consumer',
      optionalRequires: [MetadataCapability],
      onConfig(ctx) {
        metadata = getMetadata(ctx, { optional: true })
      },
    })

    await collect(
      chat({
        adapter: mockAdapter(),
        messages: [{ role: 'user', content: 'hello' }],
        middleware: [withPersistence(persistence), consumer],
      }),
    )

    expect(metadata).toBeUndefined()
  })
})
