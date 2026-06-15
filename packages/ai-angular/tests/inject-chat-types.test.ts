/**
 * Type-level tests for `injectChat()`'s return-type narrowing when
 * `outputSchema` is supplied. Mirrors ai-vue/tests/use-chat-types.test.ts;
 * pure compile-time assertions — no runtime behaviour tested.
 */

import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { Signal } from '@angular/core'
import type { AnyClientTool } from '@tanstack/ai'
import { injectChat } from '../src/inject-chat'
import type { DeepPartial, InjectChatResult } from '../src/types'

type Person = { name: string; age: number; email: string }
type NoTools = ReadonlyArray<AnyClientTool>

// Use a concrete Zod schema type so InferSchemaType resolves to Person.
const personSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string(),
})
type ConcretePersonSchema = typeof personSchema

describe('injectChat() return type (angular)', () => {
  describe('with outputSchema', () => {
    it('exposes typed partial + final signals', () => {
      type R = InjectChatResult<NoTools, ConcretePersonSchema>
      expectTypeOf<R['partial']>().toEqualTypeOf<
        Signal<DeepPartial<Person>>
      >()
      expectTypeOf<R['final']>().toEqualTypeOf<Signal<Person | null>>()
    })

    it('options accept outputSchema with the schema type', () => {
      // ReturnType when a schema is provided should include partial and final.
      type R = InjectChatResult<NoTools, ConcretePersonSchema>
      // These accesses must compile (not @ts-expect-error) — if partial/final
      // are absent from the conditional type, this will fail tsc.
      const _partial: R['partial'] = undefined as unknown as R['partial']
      const _final: R['final'] = undefined as unknown as R['final']
      void _partial
      void _final
    })

    it('partial is Signal<DeepPartial<T>> and final is Signal<T | null>', () => {
      type R = InjectChatResult<NoTools, ConcretePersonSchema>
      // Structural check: partial must be callable and return DeepPartial<Person>
      expectTypeOf<ReturnType<R['partial']>>().toEqualTypeOf<
        DeepPartial<Person>
      >()
      // final must be callable and return Person | null
      expectTypeOf<ReturnType<R['final']>>().toEqualTypeOf<Person | null>()
    })
  })

  describe('without outputSchema', () => {
    it('does NOT expose partial or final', () => {
      type R = InjectChatResult<NoTools>
      // @ts-expect-error — partial only exists when outputSchema is supplied
      type _Partial = R['partial']
      // @ts-expect-error — final only exists when outputSchema is supplied
      type _Final = R['final']
      void (undefined as unknown as _Partial)
      void (undefined as unknown as _Final)
    })

    it('ReturnType of injectChat<> (no schema arg) also omits partial/final', () => {
      // injectChat is called at runtime so this test uses a type-only check
      type R = ReturnType<typeof injectChat>
      // @ts-expect-error — partial must not exist on the no-schema return
      type _P = R['partial']
      // @ts-expect-error — final must not exist on the no-schema return
      type _F = R['final']
      void (undefined as unknown as _P)
      void (undefined as unknown as _F)
    })
  })
})
