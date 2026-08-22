/**
 * Native combined mode with `combinedStructuredOutputSource() === 'event'`.
 *
 * Harness adapters emit `structured-output.complete` during chatStream.
 * The engine must harvest that event and must not JSON.parse assistant prose.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter } from './test-utils'
import type { StreamChunk } from '../src/types'
import type { AdapterYieldChunk } from '../src/utilities/adapter-yield-chunk'

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
})
type Person = z.infer<typeof PersonSchema>

const validPerson: Person = { name: 'Jane Roe', age: 31 }

function isNamedCustom(chunk: StreamChunk, name: string): boolean {
  return chunk.type === EventType.CUSTOM && chunk.name === name
}

function eventSourcedTurn(args: {
  prose: string
  complete?: Person
  runError?: string
}): Array<AdapterYieldChunk> {
  const ts = 1
  const chunks: Array<AdapterYieldChunk> = [
    {
      type: EventType.RUN_STARTED,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: ts,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'msg-1',
      role: 'assistant',
      timestamp: ts,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'msg-1',
      delta: args.prose,
      timestamp: ts,
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'msg-1',
      timestamp: ts,
    },
  ]
  if (args.complete) {
    const raw = JSON.stringify(args.complete)
    chunks.push(
      {
        type: EventType.CUSTOM,
        name: 'structured-output.start',
        value: { messageId: 'msg-so' },
        timestamp: ts,
      },
      {
        type: EventType.CUSTOM,
        name: 'structured-output.complete',
        value: { object: args.complete, raw, messageId: 'msg-so' },
        timestamp: ts,
      },
    )
  }
  if (args.runError) {
    chunks.push({
      type: EventType.RUN_ERROR,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: ts,
      message: args.runError,
      error: { message: args.runError },
    })
  } else {
    chunks.push({
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      finishReason: 'stop',
      timestamp: ts,
    })
  }
  return chunks
}

describe('chat({ outputSchema }) — combined event source', () => {
  it('forwards outputSchema to chatStream and skips the finalization adapter call', async () => {
    let structuredCalled = false
    let structuredStreamCalled = false

    const { adapter, calls } = createMockAdapter({
      iterations: [
        eventSourcedTurn({ prose: 'looking around', complete: validPerson }),
      ],
      structuredOutput: async () => {
        structuredCalled = true
        return { data: {}, rawText: '{}' }
      },
      structuredOutputStream: () => {
        structuredStreamCalled = true
        return (async function* () {})()
      },
      supportsCombinedToolsAndSchema: true,
      combinedStructuredOutputSource: 'event',
    })

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      }),
    )

    expect(calls.length).toBe(1)
    expect(calls[0]?.outputSchema).toBeDefined()
    expect(structuredCalled).toBe(false)
    expect(structuredStreamCalled).toBe(false)
  })

  it('returns the adapter complete object on the Promise path', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        eventSourcedTurn({
          prose: 'I will look around.',
          complete: validPerson,
        }),
      ],
      supportsCombinedToolsAndSchema: true,
      combinedStructuredOutputSource: 'event',
    })

    const person = await chat({
      adapter,
      messages: [{ role: 'user', content: 'extract' }],
      outputSchema: PersonSchema,
    })

    expect(person).toEqual(validPerson)
  })

  it('does not synthesize start before prose text on the stream path', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        eventSourcedTurn({
          prose: 'I will look around.',
          complete: validPerson,
        }),
      ],
      supportsCombinedToolsAndSchema: true,
      combinedStructuredOutputSource: 'event',
    })

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      }),
    )

    const startIdx = chunks.findIndex((c) =>
      isNamedCustom(c, 'structured-output.start'),
    )
    const textStartIdx = chunks.findIndex(
      (c) => c.type === EventType.TEXT_MESSAGE_START,
    )
    const completeIdx = chunks.findIndex((c) =>
      isNamedCustom(c, 'structured-output.complete'),
    )

    expect(textStartIdx).toBeGreaterThanOrEqual(0)
    expect(startIdx).toBeGreaterThan(textStartIdx)
    expect(completeIdx).toBeGreaterThan(startIdx)

    const completes = chunks.filter((c) =>
      isNamedCustom(c, 'structured-output.complete'),
    )
    expect(completes).toHaveLength(1)
    const complete = completes[0]
    expect(complete?.type).toBe(EventType.CUSTOM)
    if (complete?.type === EventType.CUSTOM) {
      expect(complete.value).toEqual(
        expect.objectContaining({ object: validPerson }),
      )
    }
  })

  it('errors with missing-result when no complete event arrives', async () => {
    const { adapter } = createMockAdapter({
      iterations: [eventSourcedTurn({ prose: 'I will look around.' })],
      supportsCombinedToolsAndSchema: true,
      combinedStructuredOutputSource: 'event',
    })

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      }),
    )

    const runError = chunks.find((c) => c.type === EventType.RUN_ERROR)
    expect(runError?.type).toBe(EventType.RUN_ERROR)
    if (runError?.type === EventType.RUN_ERROR) {
      expect(runError.code).toBe('structured-output-missing-result')
    }
  })

  it('does not harvest a second error after an adapter RUN_ERROR', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        eventSourcedTurn({
          prose: 'I will look around.',
          runError: 'harness failed',
        }),
      ],
      supportsCombinedToolsAndSchema: true,
      combinedStructuredOutputSource: 'event',
    })

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      }),
    )

    const errors = chunks.filter((c) => c.type === EventType.RUN_ERROR)
    expect(errors).toHaveLength(1)
    if (errors[0]?.type === EventType.RUN_ERROR) {
      expect(errors[0].message).toBe('harness failed')
      expect(errors[0].code).not.toBe('structured-output-missing-result')
      expect(errors[0].code).not.toBe('structured-output-parse-failed')
    }
  })

  it('throws the adapter RUN_ERROR on the Promise path', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        eventSourcedTurn({
          prose: 'I will look around.',
          runError: 'harness failed',
        }),
      ],
      supportsCombinedToolsAndSchema: true,
      combinedStructuredOutputSource: 'event',
    })

    await expect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
      }),
    ).rejects.toThrow('harness failed')
  })
})
