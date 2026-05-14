/**
 * Type-level tests for `useChat()`'s return-type narrowing when `outputSchema`
 * is supplied. Pinning the shape so a future refactor can't silently regress
 * the schema-driven `partial` / `final` discrimination. These assertions are
 * pure types — they never invoke the hook at runtime (which would require a
 * React renderer).
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { StandardJSONSchemaV1 } from '@standard-schema/spec'
import type { AnyClientTool } from '@tanstack/ai'
import type { DeepPartial, UseChatOptions, UseChatReturn } from '../src/types'

type Person = { name: string; age: number; email: string }
type PersonSchema = StandardJSONSchemaV1<Person, Person>
type NoTools = ReadonlyArray<AnyClientTool>

describe('useChat() return type', () => {
  describe('with outputSchema', () => {
    it('exposes typed partial + final', () => {
      type R = UseChatReturn<NoTools, PersonSchema>
      expectTypeOf<R['partial']>().toEqualTypeOf<DeepPartial<Person>>()
      expectTypeOf<R['final']>().toEqualTypeOf<Person | null>()
    })

    it('still exposes the base shape (messages, sendMessage, isLoading, …)', () => {
      type R = UseChatReturn<NoTools, PersonSchema>
      expectTypeOf<R['sendMessage']>().toBeFunction()
      expectTypeOf<R['isLoading']>().toBeBoolean()
      expectTypeOf<R['messages']>().toBeArray()
    })

    it('options accept outputSchema with the schema type', () => {
      type O = UseChatOptions<NoTools, PersonSchema>
      expectTypeOf<O['outputSchema']>().toEqualTypeOf<
        PersonSchema | undefined
      >()
    })
  })

  describe('without outputSchema', () => {
    it('does NOT expose partial or final', () => {
      type R = UseChatReturn<NoTools>
      // The conditional resolves to Record<never, never>, so accessing
      // `partial` / `final` keys is a type error.
      // @ts-expect-error - partial only exists when outputSchema is supplied
      type _Partial = R['partial']
      // @ts-expect-error - final only exists when outputSchema is supplied
      type _Final = R['final']
    })

    it('preserves the base return shape', () => {
      type R = UseChatReturn<NoTools>
      expectTypeOf<R['sendMessage']>().toBeFunction()
      expectTypeOf<R['isLoading']>().toBeBoolean()
    })
  })
})
