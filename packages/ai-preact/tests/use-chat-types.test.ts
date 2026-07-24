/**
 * Type-level tests for `useChat()` client-tool runtime context inference.
 * Pure types only; hook calls are never invoked at runtime.
 */

import { describe, expectTypeOf, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { clientTools } from '@tanstack/ai-client'
import { useChat } from '../src/use-chat'
import type { UseChatOptions, UseChatReturn } from '../src/types'

type TestSchema<T> = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: 'test'
    readonly types: { readonly input: T; readonly output: T }
    readonly validate: (value: unknown) => { readonly value: T }
  }
}

describe('useChat() return type (preact)', () => {
  describe('with typed client tool context', () => {
    it('requires context matching the tool tuple', () => {
      type ClientContext = { localUserId: string; a: 'literal' }
      const tool = toolDefinition({
        name: 'preactClientContextTool',
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
