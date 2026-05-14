/**
 * Unit tests for `chat({ outputSchema, stream: true })`'s orchestrator
 * (runStreamingStructuredOutput / runStreamingStructuredOutputImpl in
 * `activities/chat/index.ts`).
 *
 * The orchestrator wraps the adapter's `structuredOutputStream` (or falls back
 * to wrapping the non-streaming `structuredOutput`) and threads Standard-Schema
 * validation through the terminal `CUSTOM structured-output.complete` event.
 * These tests pin the behavior so a future refactor of the orchestrator can't
 * silently regress validation, reasoning forwarding, or the fallback path.
 *
 * Adapter-side branches (chat-completions vs. responses, provider quirks) are
 * exercised by the per-adapter test suites under packages/typescript/openai-base
 * and the e2e suite. This file is the orchestrator-only fixture.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { EventType } from '../src/types'
import type { StreamChunk } from '../src/types'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import { collectChunks } from './test-utils'

const PersonSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
})
type Person = z.infer<typeof PersonSchema>

const validPerson: Person = {
  name: 'John Doe',
  age: 30,
  email: 'john@example.com',
}

/**
 * Minimal AnyTextAdapter shell — only the fields the orchestrator touches in
 * the no-tools structured-output streaming path. Optional callbacks let each
 * test wire just the behaviour it needs.
 */
function makeAdapter(opts: {
  structuredOutputStream?: (o: unknown) => AsyncIterable<StreamChunk>
  structuredOutput?: (o: unknown) => Promise<{ data: unknown; rawText: string }>
}): AnyTextAdapter {
  return {
    kind: 'text' as const,
    name: 'mock',
    model: 'test-model' as const,
    '~types': {
      providerOptions: {} as Record<string, unknown>,
      inputModalities: ['text'] as readonly ['text'],
      messageMetadataByModality: {
        text: undefined as unknown,
        image: undefined as unknown,
        audio: undefined as unknown,
        video: undefined as unknown,
        document: undefined as unknown,
      },
      toolCapabilities: [] as ReadonlyArray<string>,
      toolCallMetadata: undefined as unknown,
    },
    chatStream: () => (async function* () {})(),
    structuredOutput:
      (opts.structuredOutput as AnyTextAdapter['structuredOutput']) ??
      (async () => ({
        data: validPerson,
        rawText: JSON.stringify(validPerson),
      })),
    ...(opts.structuredOutputStream
      ? {
          structuredOutputStream:
            opts.structuredOutputStream as AnyTextAdapter['structuredOutputStream'],
        }
      : {}),
  } as AnyTextAdapter
}

/** Build a complete adapter-emitted structured-output stream. */
function structuredStreamChunks(
  fullJson: string,
  object: unknown,
  reasoning?: string,
): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'run-1',
      threadId: 'thread-1',
      timestamp: Date.now(),
    } as StreamChunk,
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'msg-1',
      role: 'assistant',
      timestamp: Date.now(),
    } as StreamChunk,
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'msg-1',
      delta: fullJson,
      timestamp: Date.now(),
    } as StreamChunk,
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'msg-1',
      timestamp: Date.now(),
    } as StreamChunk,
    {
      type: EventType.CUSTOM,
      name: 'structured-output.complete',
      value: {
        object,
        raw: fullJson,
        ...(reasoning ? { reasoning } : {}),
      },
      timestamp: Date.now(),
    } as StreamChunk,
    {
      type: EventType.RUN_FINISHED,
      runId: 'run-1',
      threadId: 'thread-1',
      finishReason: 'stop',
      timestamp: Date.now(),
    } as StreamChunk,
  ]
}

describe('chat({ outputSchema, stream: true })', () => {
  describe('native adapter.structuredOutputStream', () => {
    it('forwards a schema-validated structured-output.complete event', async () => {
      const adapter = makeAdapter({
        structuredOutputStream: () =>
          (async function* () {
            for (const c of structuredStreamChunks(
              JSON.stringify(validPerson),
              validPerson,
            ))
              yield c
          })(),
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      })

      // `collectChunks` expects `AsyncIterable<StreamChunk>`. The orchestrator
      // returns the narrower `StructuredOutputStream<T>` whose element union
      // includes tagged events that TS doesn't always realise are structural
      // subtypes of `CustomEvent` (and thus of `StreamChunk`) — cast through
      // the wider iterable type for the test boundary.
      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const complete = chunks.find(
        (c) =>
          c.type === EventType.CUSTOM &&
          (c as { name?: string }).name === 'structured-output.complete',
      )
      expect(complete).toBeDefined()
      const value = (complete as { value: { object: Person } }).value
      expect(value.object).toEqual(validPerson)
    })

    it('emits RUN_ERROR (code: schema-validation) when adapter data fails schema parse', async () => {
      // Adapter emits an object that's not a valid Person (age missing, email invalid).
      const invalidObject = { name: 'X', email: 'not-an-email' }
      const adapter = makeAdapter({
        structuredOutputStream: () =>
          (async function* () {
            for (const c of structuredStreamChunks(
              JSON.stringify(invalidObject),
              invalidObject,
            ))
              yield c
          })(),
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      })

      // `collectChunks` expects `AsyncIterable<StreamChunk>`. The orchestrator
      // returns the narrower `StructuredOutputStream<T>` whose element union
      // includes tagged events that TS doesn't always realise are structural
      // subtypes of `CustomEvent` (and thus of `StreamChunk`) — cast through
      // the wider iterable type for the test boundary.
      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const runError = chunks.find((c) => c.type === EventType.RUN_ERROR) as
        | { type: EventType.RUN_ERROR; code?: string; message?: string }
        | undefined

      expect(runError).toBeDefined()
      expect(runError!.code).toBe('schema-validation')

      // The (unvalidated) structured-output.complete must not have been
      // forwarded to consumers — validation failure short-circuits the
      // happy-path emit.
      const completeAfterError = chunks.find(
        (c) =>
          c.type === EventType.CUSTOM &&
          (c as { name?: string }).name === 'structured-output.complete',
      )
      expect(completeAfterError).toBeUndefined()
    })

    it('forwards `reasoning` through schema validation', async () => {
      const reasoning = 'Reading the prompt… extracting name, age, email… done.'
      const adapter = makeAdapter({
        structuredOutputStream: () =>
          (async function* () {
            for (const c of structuredStreamChunks(
              JSON.stringify(validPerson),
              validPerson,
              reasoning,
            ))
              yield c
          })(),
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      })

      // `collectChunks` expects `AsyncIterable<StreamChunk>`. The orchestrator
      // returns the narrower `StructuredOutputStream<T>` whose element union
      // includes tagged events that TS doesn't always realise are structural
      // subtypes of `CustomEvent` (and thus of `StreamChunk`) — cast through
      // the wider iterable type for the test boundary.
      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const complete = chunks.find(
        (c) =>
          c.type === EventType.CUSTOM &&
          (c as { name?: string }).name === 'structured-output.complete',
      ) as
        | {
            value: { object: Person; raw: string; reasoning?: string }
          }
        | undefined

      expect(complete).toBeDefined()
      expect(complete!.value.reasoning).toBe(reasoning)
      expect(complete!.value.object).toEqual(validPerson)
    })

    it('forwards raw JSON text via TEXT_MESSAGE_CONTENT before the terminal event', async () => {
      const adapter = makeAdapter({
        structuredOutputStream: () =>
          (async function* () {
            for (const c of structuredStreamChunks(
              JSON.stringify(validPerson),
              validPerson,
            ))
              yield c
          })(),
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      })

      // `collectChunks` expects `AsyncIterable<StreamChunk>`. The orchestrator
      // returns the narrower `StructuredOutputStream<T>` whose element union
      // includes tagged events that TS doesn't always realise are structural
      // subtypes of `CustomEvent` (and thus of `StreamChunk`) — cast through
      // the wider iterable type for the test boundary.
      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const textChunks = chunks.filter(
        (c) => c.type === EventType.TEXT_MESSAGE_CONTENT,
      )
      expect(textChunks.length).toBeGreaterThan(0)
    })
  })

  describe('fallbackStructuredOutputStream (adapter lacks native streaming)', () => {
    it('synthesizes the AG-UI lifecycle around adapter.structuredOutput', async () => {
      // No `structuredOutputStream` on the adapter — orchestrator falls back
      // to wrapping the non-streaming `structuredOutput` and synthesizing
      // RUN_STARTED → TEXT_MESSAGE_* → structured-output.complete → RUN_FINISHED.
      const adapter = makeAdapter({
        structuredOutput: async () => ({
          data: validPerson,
          rawText: JSON.stringify(validPerson),
        }),
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      })

      // `collectChunks` expects `AsyncIterable<StreamChunk>`. The orchestrator
      // returns the narrower `StructuredOutputStream<T>` whose element union
      // includes tagged events that TS doesn't always realise are structural
      // subtypes of `CustomEvent` (and thus of `StreamChunk`) — cast through
      // the wider iterable type for the test boundary.
      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )
      const types = chunks.map((c) => c.type)

      // Lifecycle envelope.
      expect(types).toContain(EventType.RUN_STARTED)
      expect(types).toContain(EventType.RUN_FINISHED)
      expect(types).toContain(EventType.TEXT_MESSAGE_START)
      expect(types).toContain(EventType.TEXT_MESSAGE_CONTENT)
      expect(types).toContain(EventType.TEXT_MESSAGE_END)

      // Terminal validated event.
      const complete = chunks.find(
        (c) =>
          c.type === EventType.CUSTOM &&
          (c as { name?: string }).name === 'structured-output.complete',
      ) as { value: { object: Person; raw: string } } | undefined
      expect(complete).toBeDefined()
      expect(complete!.value.object).toEqual(validPerson)
      expect(complete!.value.raw).toBe(JSON.stringify(validPerson))
    })

    it('emits RUN_ERROR on schema validation failure (fallback path)', async () => {
      const invalidObject = { name: 'X', age: 'not-a-number' }
      const adapter = makeAdapter({
        structuredOutput: async () => ({
          data: invalidObject,
          rawText: JSON.stringify(invalidObject),
        }),
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      })

      // `collectChunks` expects `AsyncIterable<StreamChunk>`. The orchestrator
      // returns the narrower `StructuredOutputStream<T>` whose element union
      // includes tagged events that TS doesn't always realise are structural
      // subtypes of `CustomEvent` (and thus of `StreamChunk`) — cast through
      // the wider iterable type for the test boundary.
      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const runError = chunks.find((c) => c.type === EventType.RUN_ERROR) as
        | { type: EventType.RUN_ERROR; code?: string }
        | undefined
      expect(runError).toBeDefined()
      expect(runError!.code).toBe('schema-validation')
    })
  })
})
