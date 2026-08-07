import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { chunkFingerprint, createRunScopedIdGen } from '../src/chunk-identity'
import type { StreamChunk } from '@tanstack/ai'

function textChunk(overrides: Record<string, unknown> = {}): StreamChunk {
  const chunk: Record<string, unknown> = {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm1',
    delta: 'hi',
    content: 'hi',
    timestamp: 1,
    ...overrides,
  }
  return chunk as unknown as StreamChunk
}

describe('createRunScopedIdGen', () => {
  it('produces the same sequence for the same runId, so a replay reproduces ids', () => {
    const first = createRunScopedIdGen('run-1')
    const second = createRunScopedIdGen('run-1')
    expect([first(), first(), first()]).toEqual([second(), second(), second()])
  })

  it('namespaces by runId so two runs never collide', () => {
    expect(createRunScopedIdGen('a')()).not.toBe(createRunScopedIdGen('b')())
  })

  it('is monotonic and contains no wall-clock or random component', () => {
    const gen = createRunScopedIdGen('run-1')
    expect([gen(), gen()]).toEqual(['run-1-0', 'run-1-1'])
  })
})

describe('chunkFingerprint', () => {
  it('is stable across key ordering', () => {
    expect(chunkFingerprint(textChunk())).toBe(
      chunkFingerprint({
        content: 'hi',
        delta: 'hi',
        messageId: 'm1',
        timestamp: 1,
        type: EventType.TEXT_MESSAGE_CONTENT,
      } as unknown as StreamChunk),
    )
  })

  it('ignores timestamp, which is wall-clock and cannot be reproduced', () => {
    expect(chunkFingerprint(textChunk({ timestamp: 1 }))).toBe(
      chunkFingerprint(textChunk({ timestamp: 999_999 })),
    )
  })

  it('is sensitive to messageId, which replay MUST reproduce', () => {
    expect(chunkFingerprint(textChunk({ messageId: 'm1' }))).not.toBe(
      chunkFingerprint(textChunk({ messageId: 'm2' })),
    )
  })

  it('is sensitive to the delta, so a divergent replay is detected', () => {
    expect(chunkFingerprint(textChunk({ delta: 'hi' }))).not.toBe(
      chunkFingerprint(textChunk({ delta: 'ho' })),
    )
  })

  it('normalizes nested objects and arrays deterministically', () => {
    const left = {
      type: EventType.TOOL_CALL_START,
      toolCallId: 't1',
      meta: { b: 2, a: [1, { y: 2, x: 1 }] },
    } as unknown as StreamChunk
    const right = {
      toolCallId: 't1',
      type: EventType.TOOL_CALL_START,
      meta: { a: [1, { x: 1, y: 2 }], b: 2 },
    } as unknown as StreamChunk
    expect(chunkFingerprint(left)).toBe(chunkFingerprint(right))
  })

  it('distinguishes undefined from absent so a shape change is not hidden', () => {
    expect(
      chunkFingerprint({
        type: EventType.RUN_ERROR,
        message: 'x',
      } as unknown as StreamChunk),
    ).not.toBe(
      chunkFingerprint({
        type: EventType.RUN_ERROR,
        message: 'x',
        code: undefined,
      } as unknown as StreamChunk),
    )
  })

  it('detects a change nested two levels deep inside an array (not a shallow fingerprint)', () => {
    // Tool-call arguments are nested; a fingerprint that only looked at top-level
    // keys or stringified nested values verbatim without recursing would treat
    // these as identical because the top-level `meta` key is "present" in both.
    const left = {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 't1',
      meta: { items: [{ id: 1, tags: ['a', 'b'] }] },
    } as unknown as StreamChunk
    const right = {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 't1',
      meta: { items: [{ id: 1, tags: ['a', 'c'] }] },
    } as unknown as StreamChunk
    expect(chunkFingerprint(left)).not.toBe(chunkFingerprint(right))
  })

  it('is a pure function of the chunk: fingerprinting twice yields the same string', () => {
    const chunk = textChunk({ messageId: 'm7', delta: 'z' })
    expect(chunkFingerprint(chunk)).toBe(chunkFingerprint(chunk))
  })

  it('round-trips through JSON.parse(JSON.stringify(...)) with an identical fingerprint', () => {
    // This is exactly what the journal does to every chunk: it is serialized to
    // NDJSON and parsed back. Key order is not guaranteed to survive that round
    // trip, so the fingerprint must not depend on it.
    const original = textChunk({ messageId: 'm9', delta: 'round-trip' })
    const roundTripped = JSON.parse(
      JSON.stringify(original),
    ) as unknown as StreamChunk
    expect(chunkFingerprint(roundTripped)).toBe(chunkFingerprint(original))
  })
})
