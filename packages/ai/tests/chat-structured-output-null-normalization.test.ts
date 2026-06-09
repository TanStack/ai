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
import { chat } from '../src/activities/chat/index'
import { createMockAdapter } from './test-utils'

const messages = [{ role: 'user' as const, content: 'go' }]

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
})
