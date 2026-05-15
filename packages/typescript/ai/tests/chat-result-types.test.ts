/**
 * Type-level tests for `chat()`'s return-type narrowing.
 *
 * Pinning the shape returned by every `(outputSchema?, stream?)` combination so a
 * future refactor of `TextActivityResult` can't silently regress the streaming-
 * structured-output branch (issue #526).
 */

import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { StandardJSONSchemaV1 } from '@standard-schema/spec'
import type { TextActivityResult } from '../src/activities/chat'
import type {
  InferSchemaType,
  StreamChunk,
  StructuredOutputStream,
} from '../src/types'

type Person = { name: string }

// A schema branded as Standard JSON Schema so `InferSchemaType<>` can recover
// the input type — this is what real callers pass via Zod / ArkType.
type PersonSchema = StandardJSONSchemaV1<Person, Person>

describe('chat() return type', () => {
  describe('with outputSchema', () => {
    it('stream: true → StructuredOutputStream<T>', () => {
      expectTypeOf<TextActivityResult<PersonSchema, true>>().toEqualTypeOf<
        StructuredOutputStream<Person>
      >()
    })

    it('stream: false → Promise<T>', () => {
      expectTypeOf<TextActivityResult<PersonSchema, false>>().toEqualTypeOf<
        Promise<Person>
      >()
    })

    it('default stream (boolean) → Promise<T> (does NOT match streaming branch)', () => {
      // Regression guard for #526: the default `TStream = boolean` must
      // resolve to the non-streaming Promise branch. `[true] extends [boolean]`
      // is false, so the conditional falls through to `Promise<T>`.
      expectTypeOf<TextActivityResult<PersonSchema>>().toEqualTypeOf<
        Promise<Person>
      >()
    })
  })

  describe('with Zod outputSchema (regression guard for #562)', () => {
    // A real Zod schema — the failure mode #562 describes is that Zod's
    // `~standard` is typed as `StandardSchemaV1.Props` (no `jsonSchema`
    // converter), so the JSONSchema-only branch of `InferSchemaType` falls
    // through and the result type collapses to `unknown`. Pinning these
    // expectations against `typeof zodSchema` is what would have caught it.
    const zodSchema = z.object({ greeting: z.string() })
    type ZodSchema = typeof zodSchema
    type ZodPerson = { greeting: string }

    it('InferSchemaType recovers the Zod input shape', () => {
      expectTypeOf<InferSchemaType<ZodSchema>>().toEqualTypeOf<ZodPerson>()
    })

    it('stream: false → Promise<T>', () => {
      expectTypeOf<TextActivityResult<ZodSchema, false>>().toEqualTypeOf<
        Promise<ZodPerson>
      >()
    })

    it('stream: true → StructuredOutputStream<T>', () => {
      expectTypeOf<TextActivityResult<ZodSchema, true>>().toEqualTypeOf<
        StructuredOutputStream<ZodPerson>
      >()
    })

    it('default stream (boolean) → Promise<T>', () => {
      expectTypeOf<TextActivityResult<ZodSchema>>().toEqualTypeOf<
        Promise<ZodPerson>
      >()
    })
  })

  describe('without outputSchema', () => {
    it('stream: true → AsyncIterable<StreamChunk>', () => {
      expectTypeOf<TextActivityResult<undefined, true>>().toEqualTypeOf<
        AsyncIterable<StreamChunk>
      >()
    })

    it('stream: false → Promise<string>', () => {
      expectTypeOf<TextActivityResult<undefined, false>>().toEqualTypeOf<
        Promise<string>
      >()
    })

    it('default stream (boolean) → AsyncIterable<StreamChunk>', () => {
      expectTypeOf<TextActivityResult<undefined>>().toEqualTypeOf<
        AsyncIterable<StreamChunk>
      >()
    })
  })
})
