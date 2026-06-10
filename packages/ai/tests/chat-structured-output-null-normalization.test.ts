/**
 * Structured output: schema-aware null normalization.
 *
 * To satisfy OpenAI-style strict schemas, optional fields are widened to
 * `required` + nullable, so the provider returns `null` for an absent optional.
 * Validating that `null` against the original schema (`.optional()` ===
 * `T | undefined`, NOT `T | null`) used to throw. The engine now undoes the
 * widening before validation — dropping synthesized nulls while preserving the
 * ones a `.nullable()` field genuinely allows.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { undoNullWidening } from '@tanstack/ai-utils'
import { chat } from '../src/activities/chat/index'
import { convertSchemaForStructuredOutput } from '../src/activities/chat/tools/schema-converter'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter } from './test-utils'
import type { StreamChunk } from '../src/types'

const messages = [{ role: 'user' as const, content: 'go' }]

/** Find the terminal `structured-output.complete` event and return its object. */
function completeObject(chunks: Array<StreamChunk>): unknown {
  const complete = chunks.find(
    (c) =>
      c.type === EventType.CUSTOM &&
      (c as { name?: string }).name === 'structured-output.complete',
  )
  expect(complete).toBeDefined()
  return (complete as { value: { object: unknown } }).value.object
}

describe('structured output null normalization', () => {
  it('drops a provider null for an optional field so validation passes', async () => {
    const outputSchema = z.object({
      title: z.string(),
      note: z.string().optional(),
    })
    const { adapter } = createMockAdapter({
      // Strict-mode widening makes the provider return `null` for the absent
      // optional. A schema-blind round-trip would fail validation here.
      structuredOutput: async () => ({
        data: { title: 'Ship it', note: null },
        rawText: '{"title":"Ship it","note":null}',
      }),
    })

    const result = await chat({ adapter, messages, outputSchema })

    expect(result).toEqual({ title: 'Ship it' })
    expect('note' in result).toBe(false)
  })

  it('keeps a genuine null for a nullable field', async () => {
    const outputSchema = z.object({
      title: z.string(),
      tag: z.string().nullable(),
    })
    const { adapter } = createMockAdapter({
      structuredOutput: async () => ({
        data: { title: 'Ship it', tag: null },
        rawText: '{"title":"Ship it","tag":null}',
      }),
    })

    const result = await chat({ adapter, messages, outputSchema })

    expect(result).toEqual({ title: 'Ship it', tag: null })
  })

  // The streaming path doesn't schema-validate server-side, but it now un-widens
  // the terminal `structured-output.complete` object inside the engine — so a
  // consumer validating the assembled object downstream doesn't choke on a
  // synthesized `null` for an `.optional()` field, while genuine `.nullable()`
  // nulls still reach them. Mirrors the Promise<T> behaviour above.
  describe('streaming (stream: true)', () => {
    it('un-widens the streamed structured-output.complete object', async () => {
      const outputSchema = z.object({
        title: z.string(),
        note: z.string().optional(),
        tag: z.string().nullable(),
      })
      const { adapter } = createMockAdapter({
        // No native structuredOutputStream → engine wraps structuredOutput via
        // the fallback stream, then normalizes the complete event.
        structuredOutput: async () => ({
          data: { title: 'Ship it', note: null, tag: null },
          rawText: '{"title":"Ship it","note":null,"tag":null}',
        }),
      })

      const stream = chat({ adapter, messages, outputSchema, stream: true })
      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      const object = completeObject(chunks)
      // `note` (optional → synthesized null) dropped; `tag` (nullable) kept.
      expect(object).toEqual({ title: 'Ship it', tag: null })
      expect('note' in (object as object)).toBe(false)
    })
  })
})

// Closes the gap between the two halves of the fix: the widening pass that
// PRODUCES the map and the `undoNullWidening` pass that CONSUMES it. The unit
// tests in `@tanstack/ai-utils` drive `undoNullWidening` with hand-authored
// maps; here we run a real schema through `convertSchemaForStructuredOutput`
// and feed a provider-shaped payload back through the map it produced, proving
// the two can't drift.
describe('convertSchemaForStructuredOutput → undoNullWidening round trip', () => {
  it('un-widens a nested schema using the map the conversion produced', () => {
    const outputSchema = z.object({
      title: z.string(),
      note: z.string().optional(), // widened scalar
      tag: z.string().nullable(), // genuine nullable — not widened
      meta: z
        .object({ author: z.string(), rev: z.number().optional() })
        .optional(), // widened object with an inner widened field
      items: z.array(z.object({ id: z.string(), label: z.string().optional() })),
    })

    const { nullWideningMap } = convertSchemaForStructuredOutput(outputSchema)
    expect(nullWideningMap).toBeDefined()

    // What a strict provider returns: every absent optional comes back `null`.
    const providerPayload = {
      title: 'T',
      note: null,
      tag: null,
      meta: { author: 'A', rev: null },
      items: [
        { id: '1', label: null },
        { id: '2', label: 'x' },
      ],
    }

    expect(undoNullWidening(providerPayload, nullWideningMap)).toEqual({
      title: 'T',
      tag: null,
      meta: { author: 'A' },
      items: [{ id: '1' }, { id: '2', label: 'x' }],
    })
  })

  it('drops a widened nested object that comes back null', () => {
    const outputSchema = z.object({
      title: z.string(),
      meta: z.object({ author: z.string() }).optional(),
    })

    const { nullWideningMap } = convertSchemaForStructuredOutput(outputSchema)
    const result = undoNullWidening(
      { title: 'T', meta: null },
      nullWideningMap,
    ) as Record<string, unknown>

    expect(result).toEqual({ title: 'T' })
    expect('meta' in result).toBe(false)
  })
})
