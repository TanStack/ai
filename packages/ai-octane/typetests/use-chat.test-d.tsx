import { describe, expectTypeOf, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import { useChat } from '../src/index'
import type {
  DeepPartial,
  QueuedMessage,
  SendMessageOptions,
  UseChatOptions,
  UseChatReturn,
} from '../src/index'

type Person = { name: string; age: number; email: string }

/**
 * A hand-rolled shape matching `@standard-schema/spec`'s `StandardSchemaV1`
 * interface (version/vendor/validate/types), used deliberately rather than a
 * concrete library: `SchemaInput`'s `StandardSchemaV1` branch is a plain
 * structural interface, so this proves `outputSchema` inference works for *any*
 * spec-conforming validator, not just the one we happen to depend on. Tool
 * inputs below use real Zod, which is what consumers actually pass.
 */
type StandardSchemaLike<Input, Output = Input> = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (
      value: unknown,
    ) =>
      | { readonly value: Output; readonly issues?: undefined }
      | { readonly issues: ReadonlyArray<{ readonly message: string }> }
    readonly types?: {
      readonly input: Input
      readonly output: Output
    }
  }
}

type PersonSchema = StandardSchemaLike<Person, Person>

describe('useChat() return type', () => {
  describe('with outputSchema', () => {
    it('exposes typed partial + final', () => {
      type R = UseChatReturn<any, PersonSchema>
      expectTypeOf<R['partial']>().toEqualTypeOf<DeepPartial<Person>>()
      expectTypeOf<R['final']>().toEqualTypeOf<Person | null>()
    })

    it('still exposes the base shape (messages, sendMessage, isLoading, …)', () => {
      type R = UseChatReturn<any, PersonSchema>
      expectTypeOf<R['sendMessage']>().toBeFunction()
      expectTypeOf<R['isLoading']>().toBeBoolean()
      expectTypeOf<R['messages']>().toBeArray()
    })

    it('options accept outputSchema with the schema type', () => {
      type O = UseChatOptions<any, PersonSchema>
      expectTypeOf<O['outputSchema']>().toEqualTypeOf<
        PersonSchema | undefined
      >()
    })
  })

  describe('without outputSchema', () => {
    it('does NOT expose partial or final', () => {
      type R = UseChatReturn<any>
      // The conditional resolves to Record<never, never>, so accessing
      // `partial` / `final` keys is a type error.
      // @ts-expect-error - partial only exists when outputSchema is supplied
      type _Partial = R['partial']
      // @ts-expect-error - final only exists when outputSchema is supplied
      type _Final = R['final']
    })

    it('preserves the base return shape', () => {
      type R = UseChatReturn<any>
      expectTypeOf<R['sendMessage']>().toBeFunction()
      expectTypeOf<R['isLoading']>().toBeBoolean()
    })

    it('exposes queue, runId, and interrupt controls', () => {
      type R = UseChatReturn<any>
      expectTypeOf<R['queue']>().toEqualTypeOf<Array<QueuedMessage>>()
      expectTypeOf<R['cancelQueued']>().toEqualTypeOf<(id: string) => void>()
      expectTypeOf<R['runId']>().toEqualTypeOf<string | null>()
      expectTypeOf<R['resuming']>().toBeBoolean()
      expectTypeOf<R['resolveInterrupts']>().toBeFunction()
      expectTypeOf<R['cancelInterrupts']>().toBeFunction()
      expectTypeOf<R['retryInterrupts']>().toBeFunction()
      expectTypeOf<R['resumeInterrupts']>().toBeFunction()
      expectTypeOf<R['resumeInterruptsUnsafe']>().toBeFunction()
      expectTypeOf<R['sendMessage']>().toMatchTypeOf<
        (content: string, options?: SendMessageOptions) => Promise<void>
      >()
    })

    it('uses threadId as hook identity, not id', () => {
      type O = UseChatOptions<any>
      expectTypeOf<O['threadId']>().toEqualTypeOf<string | undefined>()
      // @ts-expect-error - identity is threadId; hook-level `id` was dropped
      type _Id = O['id']
    })
  })

  describe('with a bare tools array', () => {
    it('narrows tool calls from an inline array without clientTools or as const', () => {
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

    it('narrows tool calls from a separately declared const array', () => {
      const check = () => {
        const guitarTool = toolDefinition({
          name: 'getGuitar',
          description: 'Get guitar info',
        }).client(() => ({ ok: true }))
        const cartTool = toolDefinition({
          name: 'addToCart',
          description: 'Add to cart',
        }).client(() => ({ ok: true }))

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

  describe('with typed tool input and approval metadata', () => {
    it('narrows parsed input and gates approval by tool name', () => {
      const check = () => {
        const guitarTool = toolDefinition({
          name: 'getGuitar',
          description: 'Get guitar info',
          inputSchema: z.object({ id: z.string() }),
        }).client((input) => ({ id: input.id }))
        const approvalTool = toolDefinition({
          name: 'deleteAccount',
          description: 'Delete an account',
          inputSchema: z.object({ accountId: z.string() }),
          needsApproval: true,
        }).client(() => ({ deleted: true }))

        const { messages } = useChat({
          connection: { connect: async function* () {} },
          tools: [guitarTool, approvalTool],
        })

        const message = messages[0]
        if (message?.role === 'assistant') {
          for (const part of message.parts) {
            if (part.type !== 'tool-call') continue

            if (part.name === 'getGuitar') {
              if (part.input) {
                expectTypeOf(part.input.id).toBeString()
                // @ts-expect-error - deleteAccount-style input is not available after name narrowing
                void part.input.accountId
              }
              // @ts-expect-error - approval is gated behind needsApproval: true
              void part.approval
            }

            if (part.name === 'deleteAccount') {
              if (part.input) {
                expectTypeOf(part.input.accountId).toBeString()
                // @ts-expect-error - getGuitar-style input is not available after name narrowing
                void part.input.id
              }
              expectTypeOf(part.approval).toMatchTypeOf<
                | { id: string; needsApproval: boolean; approved?: boolean }
                | undefined
              >()
            }
          }
        }
      }
      void check
    })

    it('supports a generic approval handler through in-operator narrowing', () => {
      const check = () => {
        const regularTool = toolDefinition({
          name: 'readAccount',
          description: 'Read an account',
        }).client(() => ({ ok: true }))
        const approvalTool = toolDefinition({
          name: 'deleteAccount',
          description: 'Delete an account',
          needsApproval: true,
        }).client(() => ({ deleted: true }))

        const { messages } = useChat({
          connection: { connect: async function* () {} },
          tools: [regularTool, approvalTool],
        })

        const message = messages[0]
        if (message?.role === 'assistant') {
          for (const part of message.parts) {
            if (
              part.type === 'tool-call' &&
              'approval' in part &&
              part.approval
            ) {
              expectTypeOf(part.approval.id).toEqualTypeOf<string>()
            }
          }
        }
      }
      void check
    })
  })
})
