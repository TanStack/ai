/**
 * Type-level tests for `injectChat()`'s return-type narrowing when
 * `outputSchema` is supplied. Mirrors ai-vue/tests/use-chat-types.test.ts;
 * pure compile-time assertions — no runtime behaviour tested.
 */

import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineInterrupt, toolDefinition } from '@tanstack/ai'
import { clientTools } from '@tanstack/ai-client'
import type { AnyClientTool } from '@tanstack/ai'
import { injectChat } from '../src/inject-chat'
import type { Signal } from '@angular/core'
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
      expectTypeOf<R['partial']>().toEqualTypeOf<Signal<DeepPartial<Person>>>()
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

describe('injectChat() interrupt types', () => {
  it('preserves approval, generic, and client-tool inference', () => {
    const inputSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        types: {
          input: { cents: 0 },
          output: { cents: 0 },
        },
        validate: (value: unknown) => ({
          value:
            value !== null &&
            typeof value === 'object' &&
            'cents' in value &&
            typeof value.cents === 'number'
              ? { cents: value.cents }
              : { cents: 0 },
        }),
      },
    }
    const approveSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        types: {
          input: { note: '' },
          output: { note: '' },
        },
        validate: () => ({ value: { note: '' } }),
      },
    }
    const rejectSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        types: {
          input: { reason: '' },
          output: { reason: '' },
        },
        validate: () => ({ value: { reason: '' } }),
      },
    }
    const outputSchema = z.object({ accountId: z.string() })
    const transfer = toolDefinition({
      name: 'transfer',
      description: 'Transfer funds',
      needsApproval: true,
      inputSchema,
      approvalSchema: {
        approve: approveSchema,
        reject: rejectSchema,
      },
    }).client()
    const confirm = toolDefinition({
      name: 'confirm',
      description: 'Confirm without schemas',
      needsApproval: true,
    }).client()
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Lookup account',
      outputSchema,
    }).client(() => ({ accountId: 'account-1' }))
    const tools = clientTools(transfer, confirm, lookup)
    type Interrupt = ReturnType<
      InjectChatResult<typeof tools>['interrupts']
    >[number]
    type Transfer = Extract<
      Interrupt,
      { kind: 'tool-approval'; toolName: 'transfer' }
    >
    type Confirm = Extract<
      Interrupt,
      { kind: 'tool-approval'; toolName: 'confirm' }
    >
    type Generic = Extract<Interrupt, { kind: 'generic' }>

    const check = (
      transferInterrupt: Transfer,
      confirmInterrupt: Confirm,
      genericInterrupt: Generic,
    ) => {
      transferInterrupt.resolveInterrupt(true, {
        editedArgs: { cents: 100 },
        payload: { note: 'approved' },
      })
      transferInterrupt.resolveInterrupt(false, {
        payload: { reason: 'declined' },
      })
      // @ts-expect-error rejected approvals cannot edit tool input
      transferInterrupt.resolveInterrupt(false, { editedArgs: { cents: 1 } })
      transferInterrupt.resolveInterrupt(true, {
        // @ts-expect-error approve payload uses the approve branch
        payload: { reason: 'wrong branch' },
      })

      confirmInterrupt.resolveInterrupt(true)
      confirmInterrupt.resolveInterrupt(false)
      // @ts-expect-error omitted input schema forbids edited input
      confirmInterrupt.resolveInterrupt(true, { editedArgs: { cents: 1 } })
      // @ts-expect-error omitted approval branches forbid payloads
      confirmInterrupt.resolveInterrupt(false, {
        payload: { reason: 'no branch' },
      })

      expectTypeOf(genericInterrupt.resolveInterrupt)
        .parameter(0)
        .toEqualTypeOf<unknown>()
    }
    void check
  })
})

describe('injectChat() registered generic interrupt types', () => {
  it('keeps registered and external generic interrupts distinct', () => {
    const reviewPlan = defineInterrupt({
      id: 'review-plan',
      payloadSchema: z.object({ title: z.string() }),
      responseSchema: z.string().transform((value) => Number(value)),
    })
    const acknowledge = defineInterrupt({
      id: 'acknowledge',
      responseSchema: z.object({ accepted: z.boolean() }),
    })

    const check = () => {
      const chat = injectChat({
        connection: { connect: async function* () {} },
        interrupts: [reviewPlan, acknowledge],
      })
      type Interrupt = ReturnType<typeof chat.interrupts>[number]
      type Review = Extract<Interrupt, { definitionId: 'review-plan' }>
      type External = Extract<
        Exclude<Interrupt, { definitionId: string }>,
        { kind: 'generic' }
      >
      type Unbound = Extract<Interrupt, { kind: 'unbound' }>
      type CallbackInterrupt = typeof chat.resolveInterrupts extends {
        (resolver: (interrupt: infer TInterrupt) => undefined): void
      }
        ? TInterrupt
        : never

      expectTypeOf<Review['payload']>().toEqualTypeOf<
        { title: string } | undefined
      >()
      expectTypeOf<Parameters<Review['resolveInterrupt']>[0]>().toEqualTypeOf<
        string
      >()
      expectTypeOf<Parameters<External['resolveInterrupt']>[0]>().toEqualTypeOf<
        unknown
      >()
      expectTypeOf<Unbound['canResolve']>().toEqualTypeOf<false>()
      expectTypeOf<
        Extract<CallbackInterrupt, { kind: 'unbound' }>
      >().toEqualTypeOf<never>()

      const resolveReview = (review: Review) => {
        review.resolveInterrupt('42')
        // @ts-expect-error The transformed response still accepts its input type.
        review.resolveInterrupt(42)
      }
      void resolveReview
      chat.resolveInterrupts((interrupt) => {
        interrupt.cancel()
        return undefined
      })

      const existingTool = toolDefinition({
        name: 'angular-unregistered-tool',
        description: 'A tool without an interrupt registry',
        needsApproval: true,
      }).client()
      const withoutRegistry = injectChat({
        connection: { connect: async function* () {} },
        tools: clientTools(existingTool),
      })
      type WithoutRegistry = ReturnType<typeof withoutRegistry.interrupts>[number]
      type ExistingToolInterrupt = Extract<
        WithoutRegistry,
        { kind: 'tool-approval' }
      >
      type UnregisteredGeneric = Extract<WithoutRegistry, { kind: 'generic' }>
      expectTypeOf<ExistingToolInterrupt['toolName']>().toEqualTypeOf<
        'angular-unregistered-tool'
      >()
      expectTypeOf<Parameters<UnregisteredGeneric['resolveInterrupt']>[0]>().toEqualTypeOf<
        unknown
      >()
    }
    void check
  })
})
