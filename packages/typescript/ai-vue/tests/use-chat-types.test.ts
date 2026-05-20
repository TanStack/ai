/**
 * Type-level tests for `useChat()`'s return-type narrowing when `outputSchema`
 * is supplied. Mirrors the React variant; pure types only.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { StandardJSONSchemaV1 } from '@standard-schema/spec'
import type { AnyClientTool } from '@tanstack/ai'
import type { StructuredOutputPart } from '@tanstack/ai-client'
import type { ShallowRef } from 'vue'
import type { DeepPartial, UseChatOptions, UseChatReturn } from '../src/types'

type Person = { name: string; age: number; email: string }
type PersonSchema = StandardJSONSchemaV1<Person, Person>
type NoTools = ReadonlyArray<AnyClientTool>

describe('useChat() return type (vue)', () => {
  describe('with outputSchema', () => {
    it('exposes typed partial + final refs', () => {
      type R = UseChatReturn<NoTools, PersonSchema>
      expectTypeOf<R['partial']>().toEqualTypeOf<
        Readonly<ShallowRef<DeepPartial<Person>>>
      >()
      expectTypeOf<R['final']>().toEqualTypeOf<
        Readonly<ShallowRef<Person | null>>
      >()
    })

    it('options accept outputSchema with the schema type', () => {
      type O = UseChatOptions<NoTools, PersonSchema>
      expectTypeOf<O['outputSchema']>().toEqualTypeOf<
        PersonSchema | undefined
      >()
    })

    it('threads the schema type through messages → parts → structured-output.data', () => {
      type R = UseChatReturn<NoTools, PersonSchema>
      // `messages` is a readonly ref of UIMessage<TTools, Person>; the
      // structured-output part on each assistant message carries `data:
      // Person` (and `partial: DeepPartial<Person>`). No cast needed.
      type Messages =
        R['messages'] extends Readonly<ShallowRef<infer A>> ? A : never
      type Part = Messages[number]['parts'][number]
      type StructuredPart = Extract<Part, { type: 'structured-output' }>
      expectTypeOf<StructuredPart>().toEqualTypeOf<
        StructuredOutputPart<Person>
      >()
      expectTypeOf<StructuredPart['data']>().toEqualTypeOf<Person | undefined>()
    })
  })

  describe('without outputSchema', () => {
    it('does NOT expose partial or final', () => {
      type R = UseChatReturn<NoTools>
      // @ts-expect-error - partial only exists when outputSchema is supplied
      type _Partial = R['partial']
      // @ts-expect-error - final only exists when outputSchema is supplied
      type _Final = R['final']
    })

    it('messages.parts structured-output variant defaults to unknown', () => {
      type R = UseChatReturn<NoTools>
      type Messages =
        R['messages'] extends Readonly<ShallowRef<infer A>> ? A : never
      type Part = Messages[number]['parts'][number]
      type StructuredPart = Extract<Part, { type: 'structured-output' }>
      expectTypeOf<StructuredPart['data']>().toEqualTypeOf<
        unknown | undefined
      >()
    })
  })
})
