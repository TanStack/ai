/**
 * Type-level tests for `createChat()`'s return-type narrowing when
 * `outputSchema` is supplied. Mirrors the React useChat variant.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { StandardJSONSchemaV1 } from '@standard-schema/spec'
import type { AnyClientTool } from '@tanstack/ai'
import type {
  CreateChatOptions,
  CreateChatReturn,
  DeepPartial,
} from '../src/types'

type Person = { name: string; age: number; email: string }
type PersonSchema = StandardJSONSchemaV1<Person, Person>
type NoTools = ReadonlyArray<AnyClientTool>

describe('createChat() return type (svelte)', () => {
  describe('with outputSchema', () => {
    it('exposes typed partial + final reactive getters', () => {
      type R = CreateChatReturn<NoTools, PersonSchema>
      expectTypeOf<R['partial']>().toEqualTypeOf<DeepPartial<Person>>()
      expectTypeOf<R['final']>().toEqualTypeOf<Person | null>()
    })

    it('options accept outputSchema with the schema type', () => {
      type O = CreateChatOptions<NoTools, PersonSchema>
      expectTypeOf<O['outputSchema']>().toEqualTypeOf<PersonSchema | undefined>()
    })
  })

  describe('without outputSchema', () => {
    it('does NOT expose partial or final', () => {
      type R = CreateChatReturn<NoTools>
      // @ts-expect-error - partial only exists when outputSchema is supplied
      type _Partial = R['partial']
      // @ts-expect-error - final only exists when outputSchema is supplied
      type _Final = R['final']
    })
  })
})
