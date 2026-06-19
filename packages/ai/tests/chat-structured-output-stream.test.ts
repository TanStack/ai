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
 * exercised by the per-adapter test suites under packages/openai-base
 * and the e2e suite. This file is the orchestrator-only fixture.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { EventType } from '../src/types'
import type { RunFinishedEvent, StreamChunk, TokenUsage } from '../src/types'
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
  structuredOutput?: (
    o: unknown,
  ) => Promise<{ data: unknown; rawText: string; usage?: TokenUsage }>
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
      systemPromptMetadata: undefined as never,
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

    it('forwards the adapter-emitted structured-output.complete event without orchestrator-side schema validation', async () => {
      // The streaming orchestrator no longer schema-validates the terminal
      // event — that's the consumer's responsibility (they call
      // parseWithStandardSchema on `value.object`). The orchestrator only
      // pipes chunks through the engine + middleware pipeline.
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

      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      // No orchestrator-emitted schema-validation RUN_ERROR.
      const runError = chunks.find((c) => c.type === EventType.RUN_ERROR) as
        | { type: EventType.RUN_ERROR; code?: string; message?: string }
        | undefined
      expect(runError).toBeUndefined()

      // The unvalidated `structured-output.complete` event is forwarded
      // verbatim so the consumer can run its own schema validation.
      const complete = chunks.find(
        (c) =>
          c.type === EventType.CUSTOM &&
          (c as { name?: string }).name === 'structured-output.complete',
      ) as { value: { object: unknown } } | undefined
      expect(complete).toBeDefined()
      expect(complete!.value.object).toEqual(invalidObject)
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

    it('forwards the fallback-synthesized structured-output.complete event without orchestrator-side schema validation', async () => {
      // Same invariant as the native-stream variant: schema validation is
      // the consumer's responsibility. The fallback synthesizes an
      // AG-UI lifecycle around `structuredOutput` and forwards the
      // `structured-output.complete` event verbatim.
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

      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const runError = chunks.find((c) => c.type === EventType.RUN_ERROR)
      expect(runError).toBeUndefined()

      const complete = chunks.find(
        (c) =>
          c.type === EventType.CUSTOM &&
          (c as { name?: string }).name === 'structured-output.complete',
      ) as { value: { object: unknown } } | undefined
      expect(complete).toBeDefined()
      expect(complete!.value.object).toEqual(invalidObject)
    })

    it('forwards adapter-reported usage onto RUN_FINISHED (#758)', async () => {
      // Regression for #758: the fallback wraps the non-streaming
      // `structuredOutput`, whose `{ data, rawText, usage }` result includes
      // token usage. Before the fix the synthesized RUN_FINISHED dropped
      // `usage`, so consumers (and the `runOnUsage` middleware hook) saw
      // `undefined` on every fallback-path provider (Anthropic, Gemini, Ollama).
      const usage: TokenUsage = {
        promptTokens: 125,
        completionTokens: 1346,
        totalTokens: 1471,
        promptTokensDetails: { cachedTokens: 5760 },
      }
      const adapter = makeAdapter({
        structuredOutput: async () => ({
          data: validPerson,
          rawText: JSON.stringify(validPerson),
          usage,
        }),
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      })

      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const finished = chunks.find((c) => c.type === EventType.RUN_FINISHED) as
        | RunFinishedEvent
        | undefined
      expect(finished).toBeDefined()
      expect(finished!.usage).toEqual(usage)
    })

    it('omits usage on RUN_FINISHED when the adapter does not report it', async () => {
      // The conditional spread must not synthesize `usage: undefined` for
      // adapters whose `structuredOutput` returns no usage.
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

      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const finished = chunks.find((c) => c.type === EventType.RUN_FINISHED) as
        | RunFinishedEvent
        | undefined
      expect(finished).toBeDefined()
      expect('usage' in finished!).toBe(false)
    })
  })

  describe('lifecycle ordering', () => {
    it('emits structured-output.start before the first TEXT_MESSAGE_CONTENT', async () => {
      // Client-side routing (PR #577) requires `structured-output.start`
      // BEFORE any TEXT_MESSAGE_CONTENT. Without it, JSON deltas would land
      // in a plain TextPart instead of the structured-output part — so
      // `useChat({ outputSchema })` consumers would silently get raw JSON.
      //
      // No adapter currently emits `structured-output.start`, so the
      // engine's finalization step synthesizes one.
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

      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const startIndex = chunks.findIndex(
        (c) =>
          c.type === EventType.CUSTOM &&
          (c as { name?: string }).name === 'structured-output.start',
      )
      const firstContentIndex = chunks.findIndex(
        (c) => c.type === EventType.TEXT_MESSAGE_CONTENT,
      )
      expect(startIndex).toBeGreaterThanOrEqual(0)
      expect(firstContentIndex).toBeGreaterThanOrEqual(0)
      expect(startIndex).toBeLessThan(firstContentIndex)

      // The synthesized start carries a non-empty messageId so the
      // client processor can route deltas to a structured-output part on
      // the correct assistant message.
      const startChunk = chunks[startIndex] as {
        value: { messageId: string }
      }
      expect(typeof startChunk.value.messageId).toBe('string')
      expect(startChunk.value.messageId.length).toBeGreaterThan(0)
    })

    it('synthesizes structured-output.start before forwarding a pre-delta RUN_ERROR', async () => {
      // F1 regression: if the adapter errors before yielding any
      // TEXT_MESSAGE_START (auth failure, network error before stream open,
      // schema-pre-flight throw), the orchestrator must still emit
      // `structured-output.start` so the client snaps an errored
      // structured-output part on a placeholder assistant message. Without
      // this, the UI renders nothing — the part the multi-turn renderer
      // reads off the message never gets created.
      const adapter = makeAdapter({
        // Throws synchronously when fallback awaits it — the adapter never
        // yielded any TEXT_MESSAGE_START.
        structuredOutput: async () => {
          throw new Error('upstream auth failed')
        },
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      })

      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const startIndex = chunks.findIndex(
        (c) =>
          c.type === EventType.CUSTOM &&
          (c as { name?: string }).name === 'structured-output.start',
      )
      const errorIndex = chunks.findIndex((c) => c.type === EventType.RUN_ERROR)
      expect(startIndex).toBeGreaterThanOrEqual(0)
      expect(errorIndex).toBeGreaterThanOrEqual(0)
      expect(startIndex).toBeLessThan(errorIndex)

      // The synthesized start carries a non-empty messageId so the client
      // processor's `handleCustomEvent` routes it to a placeholder message.
      const startChunk = chunks[startIndex] as {
        value: { messageId: string }
      }
      expect(typeof startChunk.value.messageId).toBe('string')
      expect(startChunk.value.messageId.length).toBeGreaterThan(0)
    })

    it('forwards adapter-emitted lifecycle ordering (TEXT_MESSAGE_CONTENT precedes structured-output.complete)', async () => {
      // The new streaming orchestrator delegates lifecycle emission to the
      // engine + adapter pipeline. The engine still synthesizes a
      // `structured-output.start` event when the adapter doesn't emit one
      // (see neighboring test "synthesizes structured-output.start ..."),
      // so the consumer always sees a start marker before the first delta.
      // What this test guarantees is the natural delta ordering:
      // TEXT_MESSAGE_CONTENT chunks reach the consumer before the terminal
      // `structured-output.complete` event.
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

      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const firstContentIndex = chunks.findIndex(
        (c) => c.type === EventType.TEXT_MESSAGE_CONTENT,
      )
      const completeIndex = chunks.findIndex(
        (c) =>
          c.type === EventType.CUSTOM &&
          (c as { name?: string }).name === 'structured-output.complete',
      )
      expect(firstContentIndex).toBeGreaterThanOrEqual(0)
      expect(completeIndex).toBeGreaterThanOrEqual(0)
      expect(firstContentIndex).toBeLessThan(completeIndex)
    })
  })

  describe('agent-loop short-circuit', () => {
    it('skips chatStream when no tools are configured (no extra provider call before finalization)', async () => {
      let chatStreamCalls = 0
      let structuredStreamCalls = 0
      const adapter: AnyTextAdapter = {
        ...makeAdapter({
          structuredOutputStream: () => {
            structuredStreamCalls++
            return (async function* () {
              for (const c of structuredStreamChunks(
                JSON.stringify(validPerson),
                validPerson,
              ))
                yield c
            })()
          },
        }),
        chatStream: () => {
          chatStreamCalls++
          return (async function* () {})()
        },
      } as AnyTextAdapter

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'extract' }],
        outputSchema: PersonSchema,
        stream: true,
      })

      await collectChunks(stream as unknown as AsyncIterable<StreamChunk>)

      expect(chatStreamCalls).toBe(0)
      expect(structuredStreamCalls).toBe(1)
    })
  })
})
