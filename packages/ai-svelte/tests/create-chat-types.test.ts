/**
 * Type-level tests for `createChat()`'s return-type narrowing when
 * `outputSchema` is supplied. Mirrors the React useChat variant.
 */

import { describe, expectTypeOf, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { clientTools } from '@tanstack/ai-client'
import { createChat } from '../src/create-chat.svelte'
import type { AnyClientTool } from '@tanstack/ai'
import type { StructuredOutputPart } from '@tanstack/ai-client'
import type {
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@standard-schema/spec'
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
      expectTypeOf<O['outputSchema']>().toEqualTypeOf<
        PersonSchema | undefined
      >()
    })

    it('threads the schema type through messages → parts → structured-output.data', () => {
      type R = CreateChatReturn<NoTools, PersonSchema>
      type Part = R['messages'][number]['parts'][number]
      type StructuredPart = Extract<Part, { type: 'structured-output' }>
      expectTypeOf<StructuredPart>().toEqualTypeOf<
        StructuredOutputPart<Person>
      >()
      expectTypeOf<StructuredPart['data']>().toEqualTypeOf<Person | undefined>()
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

    it('messages.parts structured-output variant defaults to unknown', () => {
      type R = CreateChatReturn<NoTools>
      type Part = R['messages'][number]['parts'][number]
      type StructuredPart = Extract<Part, { type: 'structured-output' }>
      expectTypeOf<StructuredPart['data']>().toEqualTypeOf<
        unknown | undefined
      >()
    })
  })

  describe('with runtime context', () => {
    it('types context options and updateContext', () => {
      type ClientContext = { localUserId: string }
      type O = CreateChatOptions<NoTools, undefined, ClientContext>
      type R = CreateChatReturn<NoTools, undefined, ClientContext>

      expectTypeOf<O['context']>().toEqualTypeOf<ClientContext | undefined>()
      expectTypeOf<R['updateContext']>().toEqualTypeOf<
        (context: ClientContext) => void
      >()
    })
  })

  describe('with typed client tool context', () => {
    it('requires context matching the tool tuple', () => {
      type ClientContext = { localUserId: string; a: 'literal' }
      const tool = toolDefinition({
        name: 'svelteClientContextTool',
        description: 'Requires client context',
      }).client<ClientContext>(() => ({ ok: true }))
      const tools = clientTools(tool)

      const options: CreateChatOptions<typeof tools> = {
        connection: {
          connect: async function* () {},
        },
        tools,
        context: { localUserId: 'local-1', a: 'literal' },
      }

      expectTypeOf(options.context).toEqualTypeOf<ClientContext>()

      const missingLiteral: CreateChatOptions<typeof tools> = {
        connection: {
          connect: async function* () {},
        },
        tools,
        // @ts-expect-error - the literal context property is required
        context: { localUserId: 'local-1' },
      }
      void missingLiteral

      // @ts-expect-error - context is required when a client tool declares it
      const missingContext: CreateChatOptions<typeof tools> = {
        connection: {
          connect: async function* () {},
        },
        tools,
      }
      void missingContext

      const checkCreateChatCall = () => {
        createChat({
          connection: {
            connect: async function* () {},
          },
          tools,
          context: { localUserId: 'local-1', a: 'literal' },
        })

        createChat({
          connection: {
            connect: async function* () {},
          },
          tools,
          // @ts-expect-error - the literal context property is required
          context: { localUserId: 'local-1' },
        })
      }
      void checkCreateChatCall
    })
  })
})

describe('createChat() interrupt types', () => {
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
    const outputSchema: StandardSchemaV1<
      { accountId: string },
      { accountId: string }
    > = {
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
    }).client(() => ({ accountId: 'account-1' }))
    const tools = clientTools(transfer, confirm, lookup)
    type Interrupt = CreateChatReturn<typeof tools>['interrupts'][number]
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
