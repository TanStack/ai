/**
 * Runtime tests for `useChat({ outputSchema })`:
 *
 * - `partial` updates per `TEXT_MESSAGE_CONTENT` delta (progressive JSON parse)
 * - `final` snaps on the terminal `CUSTOM structured-output.complete` event
 * - State resets between `sendMessage` calls (on `RUN_STARTED`)
 * - User's own `onChunk` callback fires after internal tracking
 * - Without `outputSchema`, no partial/final tracking runs
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createMockConnectionAdapter } from '../../ai-client/tests/test-utils'
import { useChat } from '../src/use-chat'
import type { StandardJSONSchemaV1 } from '@standard-schema/spec'
import type { StreamChunk } from '@tanstack/ai'

type Person = { name: string; age: number; email: string }
type PersonSchema = StandardJSONSchemaV1<Person, Person>
const personSchema = {} as PersonSchema

/**
 * Build a chunk sequence simulating a streaming structured-output run:
 * RUN_STARTED → TEXT_MESSAGE_CONTENT deltas (each delta moves the buffer
 * one character closer to `fullJson`) → CUSTOM structured-output.complete
 * → RUN_FINISHED.
 */
function buildStructuredStream(
  fullJson: string,
  finalObject: Person,
  runId = 'run-1',
): Array<StreamChunk> {
  const chunks: Array<StreamChunk> = [
    {
      type: 'RUN_STARTED',
      runId,
      threadId: `thread-${runId}`,
      model: 'test',
      timestamp: Date.now(),
    } as StreamChunk,
  ]
  // Split fullJson into a few large-ish slices so we test progressive parsing
  // without producing a flood of one-char chunks.
  const sliceSize = Math.max(4, Math.floor(fullJson.length / 4))
  for (let i = 0; i < fullJson.length; i += sliceSize) {
    chunks.push({
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: `msg-${runId}`,
      delta: fullJson.slice(i, i + sliceSize),
      content: fullJson.slice(0, i + sliceSize),
      model: 'test',
      timestamp: Date.now(),
    } as StreamChunk)
  }
  chunks.push({
    type: 'CUSTOM',
    name: 'structured-output.complete',
    value: { object: finalObject, raw: fullJson },
    model: 'test',
    timestamp: Date.now(),
  } as StreamChunk)
  chunks.push({
    type: 'RUN_FINISHED',
    runId,
    threadId: `thread-${runId}`,
    model: 'test',
    timestamp: Date.now(),
    finishReason: 'stop',
  } as StreamChunk)
  return chunks
}

describe('useChat({ outputSchema }) — runtime', () => {
  const person: Person = {
    name: 'John Doe',
    age: 30,
    email: 'john@example.com',
  }
  const json = JSON.stringify(person)

  it('updates `partial` progressively and snaps `final` on the terminal event', async () => {
    const chunks = buildStructuredStream(json, person)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() =>
      useChat({ connection: adapter, outputSchema: personSchema }),
    )

    // Initial state.
    expect(result.current.partial).toEqual({})
    expect(result.current.final).toBeNull()

    await act(async () => {
      await result.current.sendMessage('Extract')
    })

    // The schema-validated `final` lands once the terminal event fires.
    await waitFor(() => {
      expect(result.current.final).toEqual(person)
    })

    // `partial` should end with the same shape (parsePartialJSON on the
    // complete buffer returns the fully-formed object).
    expect(result.current.partial).toEqual(person)
  })

  it('resets `partial` and `final` between runs', async () => {
    const personA: Person = {
      name: 'Alice',
      age: 25,
      email: 'alice@example.com',
    }
    const personB: Person = { name: 'Bob', age: 40, email: 'bob@example.com' }

    // Stateful adapter that yields a different stream per connect() call.
    // Without this, createMockConnectionAdapter would yield the same array
    // on every sendMessage — the "reset" couldn't be observed between runs
    // because final would race past personA straight to personB on call #1.
    let call = 0
    const adapter = {
      async *connect() {
        const chunks =
          call === 0
            ? buildStructuredStream(JSON.stringify(personA), personA, 'run-a')
            : buildStructuredStream(JSON.stringify(personB), personB, 'run-b')
        call++
        for (const chunk of chunks) yield chunk
      },
    }

    const { result } = renderHook(() =>
      useChat({ connection: adapter, outputSchema: personSchema }),
    )

    await act(async () => {
      await result.current.sendMessage('A')
    })
    await waitFor(() => {
      expect(result.current.final).toEqual(personA)
    })
    expect(result.current.partial).toEqual(personA)

    // Second run — RUN_STARTED at the head must clear partial/final before
    // run-b's deltas land. If the reset didn't happen, run-b's progressive
    // partial would be shadowed by leftover state from run-a (since
    // parsePartialJSON would parse run-b's accumulated buffer cleanly, but
    // the spread-onto-stale-state class of bug would still surface in `final`).
    await act(async () => {
      await result.current.sendMessage('B')
    })
    await waitFor(() => {
      expect(result.current.final).toEqual(personB)
    })
    expect(result.current.partial).toEqual(personB)
  })

  it('attaches a structured-output part to the assistant message', async () => {
    // With structured-output.start emitted, the JSON deltas route into a
    // StructuredOutputPart on the assistant message instead of a TextPart.
    // History walks `messages` and finds the typed part on each turn.
    const chunks: Array<StreamChunk> = [
      {
        type: 'RUN_STARTED',
        runId: 'run-x',
        threadId: 'thread-x',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk,
      {
        type: 'TEXT_MESSAGE_START',
        messageId: 'msg-x',
        role: 'assistant',
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk,
      {
        type: 'CUSTOM',
        name: 'structured-output.start',
        value: { messageId: 'msg-x' },
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk,
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-x',
        delta: json,
        content: json,
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk,
      {
        type: 'CUSTOM',
        name: 'structured-output.complete',
        value: { object: person, raw: json, messageId: 'msg-x' },
        model: 'test',
        timestamp: Date.now(),
      } as StreamChunk,
      {
        type: 'RUN_FINISHED',
        runId: 'run-x',
        threadId: 'thread-x',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      } as StreamChunk,
    ]
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() =>
      useChat({ connection: adapter, outputSchema: personSchema }),
    )

    await act(async () => {
      await result.current.sendMessage('Extract')
    })
    await waitFor(() => {
      expect(result.current.final).toEqual(person)
    })

    // Find the assistant message and the structured-output part on it.
    const assistant = result.current.messages.find(
      (m) => m.role === 'assistant',
    )
    expect(assistant).toBeDefined()
    const sop = assistant!.parts.find((p) => p.type === 'structured-output')
    expect(sop).toBeDefined()
    expect((sop as any).status).toBe('complete')
    expect((sop as any).data).toEqual(person)
    expect((sop as any).raw).toBe(json)

    // With start emitted, no text part should be on the assistant message
    // (the JSON bytes were routed into the structured-output part).
    const textPart = assistant!.parts.find((p) => p.type === 'text')
    expect(textPart).toBeUndefined()
  })

  it("preserves each turn's structured part across multi-turn history", async () => {
    const personA: Person = {
      name: 'Alice',
      age: 25,
      email: 'alice@example.com',
    }
    const personB: Person = { name: 'Bob', age: 40, email: 'bob@example.com' }

    function streamFor(
      p: Person,
      runId: string,
      messageId: string,
    ): Array<StreamChunk> {
      const raw = JSON.stringify(p)
      return [
        {
          type: 'RUN_STARTED',
          runId,
          threadId: `thread-${runId}`,
          model: 'test',
          timestamp: Date.now(),
        } as StreamChunk,
        {
          type: 'TEXT_MESSAGE_START',
          messageId,
          role: 'assistant',
          model: 'test',
          timestamp: Date.now(),
        } as StreamChunk,
        {
          type: 'CUSTOM',
          name: 'structured-output.start',
          value: { messageId },
          model: 'test',
          timestamp: Date.now(),
        } as StreamChunk,
        {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId,
          delta: raw,
          content: raw,
          model: 'test',
          timestamp: Date.now(),
        } as StreamChunk,
        {
          type: 'CUSTOM',
          name: 'structured-output.complete',
          value: { object: p, raw, messageId },
          model: 'test',
          timestamp: Date.now(),
        } as StreamChunk,
        {
          type: 'RUN_FINISHED',
          runId,
          threadId: `thread-${runId}`,
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        } as StreamChunk,
      ]
    }

    let call = 0
    const adapter = {
      async *connect() {
        const chunks =
          call === 0
            ? streamFor(personA, 'run-a', 'msg-a')
            : streamFor(personB, 'run-b', 'msg-b')
        call++
        for (const chunk of chunks) yield chunk
      },
    }

    const { result } = renderHook(() =>
      useChat({ connection: adapter, outputSchema: personSchema }),
    )

    await act(async () => {
      await result.current.sendMessage('A')
    })
    await waitFor(() => {
      expect(result.current.final).toEqual(personA)
    })

    await act(async () => {
      await result.current.sendMessage('B')
    })
    await waitFor(() => {
      expect(result.current.final).toEqual(personB)
    })

    // History walk: every assistant message carries its own structured part.
    const assistants = result.current.messages.filter(
      (m) => m.role === 'assistant',
    )
    expect(assistants.length).toBe(2)

    const partA = assistants[0]!.parts.find(
      (p) => p.type === 'structured-output',
    )
    const partB = assistants[1]!.parts.find(
      (p) => p.type === 'structured-output',
    )
    expect((partA as any)?.data).toEqual(personA)
    expect((partB as any)?.data).toEqual(personB)

    // `final` reflects the latest, but the earlier turn's data is still
    // recoverable via the part on the historical message.
    expect(result.current.final).toEqual(personB)
  })

  it('reads `final` as null between sendMessage and the first chunk', async () => {
    // Park the second connect() so no chunks ever arrive for run-b. The
    // assertion is that, immediately after sendMessage('B'), the latest user
    // message has no assistant message after it yet, so `final` returns null.
    const personA: Person = {
      name: 'Alice',
      age: 25,
      email: 'alice@example.com',
    }
    let call = 0
    let releaseSecond!: () => void
    const secondStarted = new Promise<void>((resolve) => {
      releaseSecond = resolve
    })
    const adapter = {
      async *connect() {
        if (call === 0) {
          call++
          const raw = JSON.stringify(personA)
          const chunks: Array<StreamChunk> = [
            {
              type: 'RUN_STARTED',
              runId: 'run-a',
              threadId: 'thread-a',
              model: 'test',
              timestamp: Date.now(),
            } as StreamChunk,
            {
              type: 'TEXT_MESSAGE_START',
              messageId: 'msg-a',
              role: 'assistant',
              model: 'test',
              timestamp: Date.now(),
            } as StreamChunk,
            {
              type: 'CUSTOM',
              name: 'structured-output.start',
              value: { messageId: 'msg-a' },
              model: 'test',
              timestamp: Date.now(),
            } as StreamChunk,
            {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId: 'msg-a',
              delta: raw,
              content: raw,
              model: 'test',
              timestamp: Date.now(),
            } as StreamChunk,
            {
              type: 'CUSTOM',
              name: 'structured-output.complete',
              value: { object: personA, raw, messageId: 'msg-a' },
              model: 'test',
              timestamp: Date.now(),
            } as StreamChunk,
            {
              type: 'RUN_FINISHED',
              runId: 'run-a',
              threadId: 'thread-a',
              model: 'test',
              timestamp: Date.now(),
              finishReason: 'stop',
            } as StreamChunk,
          ]
          for (const c of chunks) yield c
          return
        }
        await secondStarted
      },
    }

    const { result } = renderHook(() =>
      useChat({ connection: adapter, outputSchema: personSchema }),
    )

    await act(async () => {
      await result.current.sendMessage('A')
    })
    await waitFor(() => {
      expect(result.current.final).toEqual(personA)
    })

    act(() => {
      void result.current.sendMessage('B')
    })

    await waitFor(() => {
      expect(result.current.final).toBeNull()
      expect(result.current.partial).toEqual({})
    })

    releaseSecond()
  })

  it('clears `partial` and `final` on clear()', async () => {
    // `clear()` empties the messages array; the derivation then has no
    // assistant message to find an active structured-output part on, so
    // both views naturally read as cleared without any extra plumbing.
    const chunks = buildStructuredStream(json, person)
    const adapter = createMockConnectionAdapter({ chunks })

    const { result } = renderHook(() =>
      useChat({ connection: adapter, outputSchema: personSchema }),
    )

    await act(async () => {
      await result.current.sendMessage('Extract')
    })
    await waitFor(() => {
      expect(result.current.final).toEqual(person)
    })

    act(() => {
      result.current.clear()
    })

    expect(result.current.partial).toEqual({})
    expect(result.current.final).toBeNull()
  })

  it("invokes the user's onChunk callback alongside internal tracking", async () => {
    const chunks = buildStructuredStream(json, person)
    const adapter = createMockConnectionAdapter({ chunks })
    const onChunk = vi.fn()

    const { result } = renderHook(() =>
      useChat({
        connection: adapter,
        outputSchema: personSchema,
        onChunk,
      }),
    )

    await act(async () => {
      await result.current.sendMessage('Extract')
    })
    await waitFor(() => {
      expect(result.current.final).toEqual(person)
    })

    // User callback fires for every chunk the hook sees, including the
    // terminal structured-output.complete event.
    const completeCalls = onChunk.mock.calls.filter(
      ([c]) => c.type === 'CUSTOM' && c.name === 'structured-output.complete',
    )
    expect(completeCalls.length).toBe(1)
    expect(completeCalls[0]![0].value).toEqual({ object: person, raw: json })

    const deltaCalls = onChunk.mock.calls.filter(
      ([c]) => c.type === 'TEXT_MESSAGE_CONTENT',
    )
    expect(deltaCalls.length).toBeGreaterThan(0)
  })
})

describe('useChat({ outputSchema }) — initialMessages handling', () => {
  const person: Person = {
    name: 'John Doe',
    age: 30,
    email: 'john@example.com',
  }
  const json = JSON.stringify(person)

  it('does not leak `final` from a stale initialMessages assistant when no user message exists yet', async () => {
    // Regression: `activeStructuredPart` previously walked all assistant
    // messages from the end when there was no user message — so a structured
    // assistant turn carried in via `initialMessages` would leak into `final`
    // before the consumer ever sent anything. With the fix, `final` reads
    // null until a user message exists.
    const adapter = createMockConnectionAdapter({ chunks: [] })

    const { result } = renderHook(() =>
      useChat({
        connection: adapter,
        outputSchema: personSchema,
        initialMessages: [
          {
            id: 'stale-assistant',
            role: 'assistant',
            parts: [
              {
                type: 'structured-output',
                status: 'complete',
                raw: json,
                data: person,
                partial: person,
              },
            ],
            createdAt: new Date(),
          },
        ],
      }),
    )

    // The stale assistant message is visible in history…
    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0)
    })
    expect(result.current.messages[0]?.id).toBe('stale-assistant')

    // …but `final` and `partial` must NOT be derived from it.
    expect(result.current.final).toBeNull()
    expect(result.current.partial).toEqual({})
  })
})

describe('useChat() without outputSchema — runtime', () => {
  it('does not break or track structured state when no schema is supplied', async () => {
    const adapter = createMockConnectionAdapter({
      chunks: [
        {
          type: 'RUN_STARTED',
          runId: 'r',
          threadId: 't',
          model: 'test',
          timestamp: Date.now(),
        } as StreamChunk,
        {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId: 'm',
          delta: 'Hello',
          content: 'Hello',
          model: 'test',
          timestamp: Date.now(),
        } as StreamChunk,
        {
          type: 'RUN_FINISHED',
          runId: 'r',
          threadId: 't',
          model: 'test',
          timestamp: Date.now(),
          finishReason: 'stop',
        } as StreamChunk,
      ],
    })

    const { result } = renderHook(() => useChat({ connection: adapter }))

    await act(async () => {
      await result.current.sendMessage('hi')
    })
    await waitFor(() => {
      expect(result.current.messages.length).toBeGreaterThan(0)
    })
    // The return object doesn't expose `partial`/`final` at the type level
    // (the discriminated `UseChatReturn` only adds them when `outputSchema` is
    // supplied), and the runtime branch in onChunk is gated on
    // `outputSchema !== undefined` so the internal state never updates.
    // Runtime access is the only way to verify the no-op branch. TS cannot
    // express "this object happens to also carry these fields at runtime
    // even though the type says it doesn't", so a single bridge cast to
    // `unknown` is the minimum legal escape.
    const runtimeView: { partial?: unknown; final?: unknown } =
      result.current as unknown as { partial?: unknown; final?: unknown }
    expect(runtimeView.partial).toEqual({})
    expect(runtimeView.final).toBeNull()
  })
})
