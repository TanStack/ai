/**
 * Type-level tests for `useChat()`'s return-type narrowing when `outputSchema`
 * is supplied. Pinning the shape so a future refactor can't silently regress
 * the schema-driven `partial` / `final` discrimination. These assertions are
 * pure types — they never invoke the hook at runtime (which would require a
 * React renderer).
 */

import { describe, expectTypeOf, it } from 'vitest'
import {  toolDefinition } from '@tanstack/ai'
import { clientTools } from '@tanstack/ai-client'
import { useChat } from '../src/use-chat'
import type {AnyClientTool} from '@tanstack/ai';
import type { StandardJSONSchemaV1 } from '@standard-schema/spec'
import type { DeepPartial, UseChatOptions, UseChatReturn } from '../src/types'

type Person = { name: string; age: number; email: string }
type PersonSchema = StandardJSONSchemaV1<Person, Person>
type NoTools = ReadonlyArray<AnyClientTool>
type TestSchema<T> = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: 'test'
    readonly types: { readonly input: T; readonly output: T }
    readonly validate: (value: unknown) => { readonly value: T }
  }
}

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

  describe('with a bare inline tools array (no clientTools / no `as const`)', () => {
    it('narrows tool-call parts from a plain array literal', () => {
      // Type-only assertion — the closure is never invoked, so the hook never
      // runs at runtime (it would throw outside a React renderer). `tsc`
      // (test:types) still checks the body, which is what proves the narrowing.
      const check = () => {
        const guitarTool = toolDefinition({
          name: 'getGuitar',
          description: 'Get guitar info',
        }).client(() => ({ ok: true }))
        const cartTool = toolDefinition({
          name: 'addToCart',
          description: 'Add to cart',
        }).client(() => ({ ok: true }))

        const { messages } = useChat({
          connection: { connect: async function* () {} },
          // plain array literal — the `const` modifier on useChat's TTools
          // captures the tuple + literal tool names, so no `clientTools(...)`
          // wrapper and no `as const` are needed for chunk narrowing.
          tools: [guitarTool, cartTool],
        })

        const message = messages[0]
        if (message?.role === 'assistant') {
          for (const part of message.parts) {
            if (part.type === 'tool-call') {
              expectTypeOf(part.name).toEqualTypeOf<'getGuitar' | 'addToCart'>()
            }
          }
        }
      }
      void check
    })

    it('narrows a separately-declared const array (no clientTools / no `as const`)', () => {
      const check = () => {
        const guitarTool = toolDefinition({
          name: 'getGuitar',
          description: 'Get guitar info',
        }).client(() => ({ ok: true }))
        const cartTool = toolDefinition({
          name: 'addToCart',
          description: 'Add to cart',
        }).client(() => ({ ok: true }))

        // Separate const, NO clientTools, NO `as const`:
        const tools = [guitarTool, cartTool]
        const { messages } = useChat({
          connection: { connect: async function* () {} },
          tools,
        })
        const message = messages[0]
        if (message?.role === 'assistant') {
          for (const part of message.parts) {
            if (part.type === 'tool-call') {
              expectTypeOf(part.name).toEqualTypeOf<'getGuitar' | 'addToCart'>()
            }
          }
        }
      }
      void check
    })
  })

  describe('with typed client tool context', () => {
    it('requires context matching the tool tuple', () => {
      type ClientContext = { localUserId: string; a: 'literal' }
      const tool = toolDefinition({
        name: 'reactClientContextTool',
        description: 'Requires client context',
      }).client<ClientContext>(() => ({ ok: true }))
      const tools = clientTools(tool)

      const options: UseChatOptions<typeof tools> = {
        connection: {
          connect: async function* () {},
        },
        tools,
        context: { localUserId: 'local-1', a: 'literal' },
      }

      expectTypeOf(options.context).toEqualTypeOf<ClientContext>()

      const missingLiteral: UseChatOptions<typeof tools> = {
        connection: {
          connect: async function* () {},
        },
        tools,
        // @ts-expect-error - the literal context property is required
        context: { localUserId: 'local-1' },
      }
      void missingLiteral

      // @ts-expect-error - context is required when a client tool declares it
      const missingContext: UseChatOptions<typeof tools> = {
        connection: {
          connect: async function* () {},
        },
        tools,
      }
      void missingContext

      const checkUseChatCall = () => {
        useChat({
          connection: {
            connect: async function* () {},
          },
          tools,
          context: { localUserId: 'local-1', a: 'literal' },
        })

        useChat({
          connection: {
            connect: async function* () {},
          },
          tools,
          // @ts-expect-error - the literal context property is required
          context: { localUserId: 'local-1' },
        })
      }
      void checkUseChatCall
    })
  })
})

describe('useChat() interrupt types', () => {
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
    const outputSchema: TestSchema<{ accountId: string }> = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        types: {
          input: { accountId: '' },
          output: { accountId: '' },
        },
        validate: () => ({ value: { accountId: '' } }),
      },
    }
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
    }).client()
    const tools = clientTools(transfer, confirm, lookup)
    type Interrupt = UseChatReturn<typeof tools>['interrupts'][number]
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
      // @ts-expect-error approve payload uses the approve branch
      transferInterrupt.resolveInterrupt(true, {
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
