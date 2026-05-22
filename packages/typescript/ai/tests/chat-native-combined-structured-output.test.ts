/**
 * Unit tests for the native combined tools+schema path added in issue #605.
 *
 * When an adapter declares `supportsCombinedToolsAndSchema()`, the engine
 * threads the converted JSON Schema through to `chatStream` (so the adapter
 * can attach `response_format` / `text.format` / `output_format` to the
 * upstream request) and SKIPS the separate
 * `runStructuredFinalization` round-trip. The agent loop's final-turn text
 * IS the schema-constrained JSON; the engine parses it from accumulated
 * content, emits synthetic `structured-output.start` / `.complete` events
 * for the client, and runs validation for the Promise<T> path.
 *
 * These tests pin the contract so a future engine refactor can't silently
 * regress per-PR-#605 routing or accidentally re-introduce the extra
 * provider call for native-capable adapters.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter } from './test-utils'
import type { StreamChunk } from '../src/types'

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
})
type Person = z.infer<typeof PersonSchema>

const validPerson: Person = { name: 'Jane Roe', age: 31 }

function textTurn(json: string): Array<StreamChunk> {
  const ts = Date.now()
  return [
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
      delta: json,
      timestamp: ts,
    } ,
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'msg-1',
      timestamp: ts,
    } ,
    {
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      finishReason: 'stop',
      timestamp: ts,
    } ,
  ]
}

describe('chat({ outputSchema, stream: true }) — native combined mode (#605)', () => {
  it('forwards outputSchema to chatStream and skips the finalization adapter call', async () => {
    let structuredCalled = false
    let structuredStreamCalled = false

    const { adapter, calls } = createMockAdapter({
      iterations: [textTurn(JSON.stringify(validPerson))],
      structuredOutput: async () => {
        structuredCalled = true
        return { data: {}, rawText: '{}' }
      },
      structuredOutputStream: () => {
        structuredStreamCalled = true
        return (async function* () {})()
      },
      supportsCombinedToolsAndSchema: true,
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'extract' }],
      outputSchema: PersonSchema,
      stream: true,
    })

    await collectChunks(stream)

    // The agent loop's single chatStream call IS the structured call.
    expect(calls.length).toBe(1)
    expect(calls[0]?.outputSchema).toBeDefined()
    // No separate finalization round-trip.
    expect(structuredCalled).toBe(false)
    expect(structuredStreamCalled).toBe(false)
  })

  it('synthesizes structured-output.start before TEXT_MESSAGE_START and structured-output.complete after the loop', async () => {
    const json = JSON.stringify(validPerson)
    const { adapter } = createMockAdapter({
      iterations: [textTurn(json)],
      supportsCombinedToolsAndSchema: true,
    })

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      })
    )

    const startIdx = chunks.findIndex(
      (c) =>
        c.type === EventType.CUSTOM &&
        (c as { name?: string }).name === 'structured-output.start',
    )
    const textStartIdx = chunks.findIndex(
      (c) => c.type === EventType.TEXT_MESSAGE_START,
    )
    const completeIdx = chunks.findIndex(
      (c) =>
        c.type === EventType.CUSTOM &&
        (c as { name?: string }).name === 'structured-output.complete',
    )

    expect(startIdx).toBeGreaterThanOrEqual(0)
    expect(textStartIdx).toBeGreaterThanOrEqual(0)
    expect(completeIdx).toBeGreaterThanOrEqual(0)

    // start before text deltas (so the client routes them to a
    // StructuredOutputPart, not a TextPart).
    expect(startIdx).toBeLessThan(textStartIdx)
    // complete after the text ends, so the parsed object is available
    // once the streaming text has fully arrived.
    expect(completeIdx).toBeGreaterThan(textStartIdx)

    const complete = chunks[completeIdx] as { value: { object: unknown } }
    expect(complete.value.object).toEqual(validPerson)
  })

  it('emits a single outer RUN_STARTED / RUN_FINISHED pair (no double lifecycle)', async () => {
    const { adapter } = createMockAdapter({
      iterations: [textTurn(JSON.stringify(validPerson))],
      supportsCombinedToolsAndSchema: true,
    })

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      }),
    )

    const runStarted = chunks.filter((c) => c.type === EventType.RUN_STARTED)
    const runFinished = chunks.filter((c) => c.type === EventType.RUN_FINISHED)
    expect(runStarted.length).toBe(1)
    expect(runFinished.length).toBe(1)
  })

  it('Promise<T> path skips finalization and returns the validated typed value', async () => {
    let structuredCalled = false
    const { adapter, calls } = createMockAdapter({
      iterations: [textTurn(JSON.stringify(validPerson))],
      structuredOutput: async () => {
        structuredCalled = true
        return { data: {}, rawText: '{}' }
      },
      supportsCombinedToolsAndSchema: true,
    })

    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'extract' }],
      outputSchema: PersonSchema,
    })

    expect(result).toEqual(validPerson)
    expect(structuredCalled).toBe(false)
    expect(calls.length).toBe(1)
    expect(calls[0]?.outputSchema).toBeDefined()
  })

  it('Promise<T> path routes Standard-Schema validation failures through onError', async () => {
    const invalid = { name: 123, age: 'not-a-number' }
    const { adapter } = createMockAdapter({
      iterations: [textTurn(JSON.stringify(invalid))],
      supportsCombinedToolsAndSchema: true,
    })

    await expect(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
      }),
    ).rejects.toThrow()
  })

  it('emits a RUN_ERROR on the streaming path when the final-turn text is not valid JSON', async () => {
    const { adapter } = createMockAdapter({
      iterations: [textTurn('not-json-at-all')],
      supportsCombinedToolsAndSchema: true,
    })

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      }),
    )

    const runError = chunks.find((c) => c.type === EventType.RUN_ERROR) as
      | { type: EventType.RUN_ERROR; code?: string }
      | undefined
    expect(runError).toBeDefined()
    expect(runError!.code).toBe('structured-output-parse-failed')

    // No structured-output.complete on the parse-failure path.
    const complete = chunks.find(
      (c) =>
        c.type === EventType.CUSTOM &&
        (c as { name?: string }).name === 'structured-output.complete',
    )
    expect(complete).toBeUndefined()
  })

  it('adapters that do not declare the capability still take the finalization path', async () => {
    let structuredStreamCalled = false
    const { adapter, calls } = createMockAdapter({
      iterations: [textTurn(JSON.stringify(validPerson))],
      structuredOutputStream: () => {
        structuredStreamCalled = true
        const ts = Date.now()
        return (async function* () {
          yield {
            type: EventType.RUN_STARTED,
            runId: 'run-2',
            threadId: 'thread-1',
            timestamp: ts,
          } 
          yield {
            type: EventType.TEXT_MESSAGE_START,
            messageId: 'msg-2',
            role: 'assistant',
            timestamp: ts,
          } 
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'msg-2',
            delta: JSON.stringify(validPerson),
            timestamp: ts,
          } 
          yield {
            type: EventType.TEXT_MESSAGE_END,
            messageId: 'msg-2',
            timestamp: ts,
          } 
          yield {
            type: EventType.CUSTOM,
            name: 'structured-output.complete',
            value: { object: validPerson, raw: JSON.stringify(validPerson) },
            timestamp: ts,
          } 
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'run-2',
            threadId: 'thread-1',
            finishReason: 'stop',
            timestamp: ts,
          } 
        })()
      },
      // supportsCombinedToolsAndSchema NOT set
    })

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      }),
    )

    // Engine took the legacy finalization path: separate adapter call.
    expect(structuredStreamCalled).toBe(true)
    // The agent loop short-circuited (no tools + finalization requested),
    // so chatStream was never called.
    expect(calls.length).toBe(0)
  })
})
