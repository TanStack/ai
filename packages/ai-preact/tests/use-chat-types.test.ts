/**
 * Type-level tests for `useChat()` client-tool runtime context inference.
 * Pure types only; hook calls are never invoked at runtime.
 */

import { describe, expectTypeOf, it } from 'vitest'
import {
  defineActivityType,
  defineInterrupt,
  toolDefinition,
} from '@tanstack/ai'
import { clientTools } from '@tanstack/ai-client'
import { createChatHook } from '../src/create-chat-hook'
import { useChat } from '../src/use-chat'
import type { UseChatOptions, UseChatReturn } from '../src/types'

type TestSchema<T> = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: 'test'
    readonly types: { readonly input: T; readonly output: T }
    readonly validate: (value: unknown) => { readonly value: T }
    readonly jsonSchema: { readonly input: () => Record<string, unknown> }
  }
}
type TransformSchema = {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: 'test'
    readonly types: { readonly input: string; readonly output: number }
    readonly validate: (value: unknown) => { readonly value: number }
    readonly jsonSchema: { readonly input: () => Record<string, unknown> }
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
        threadId: 'thread-1',
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
          threadId: 'thread-1',
          connection: {
            connect: async function* () {},
          },
          tools,
          context: { localUserId: 'local-1', a: 'literal' },
        })

        useChat({
          threadId: 'thread-1',
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

  it('exposes respondToSandboxApproval', () => {
    expectTypeOf<UseChatReturn['respondToSandboxApproval']>().toEqualTypeOf<
      (approvalId: string, granted: boolean) => Promise<void>
    >()
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
        jsonSchema: { input: () => ({ type: 'object' }) },
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

describe('useChat() registered generic interrupt types', () => {
  it('keeps registered and external generic interrupts distinct', () => {
    const payloadSchema: TestSchema<{ title: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        types: { input: { title: '' }, output: { title: '' } },
        validate: () => ({ value: { title: '' } }),
        jsonSchema: { input: () => ({ type: 'object' }) },
      },
    }
    const responseSchema: TransformSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        types: { input: '', output: 0 },
        validate: () => ({ value: 0 }),
        jsonSchema: { input: () => ({ type: 'string' }) },
      },
    }
    const reviewPlan = defineInterrupt({
      id: 'review-plan',
      payloadSchema,
      responseSchema,
    })
    const acknowledge = defineInterrupt({
      id: 'acknowledge',
      responseSchema: payloadSchema,
    })

    const check = () => {
      const chat = useChat({
        threadId: 'thread-1',
        connection: { connect: async function* () {} },
        interrupts: [reviewPlan, acknowledge],
      })
      type Interrupt = (typeof chat.interrupts)[number]
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
      expectTypeOf<
        Parameters<Review['resolveInterrupt']>[0]
      >().toEqualTypeOf<string>()
      expectTypeOf<
        Parameters<External['resolveInterrupt']>[0]
      >().toEqualTypeOf<unknown>()
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
        name: 'preact-unregistered-tool',
        description: 'A tool without an interrupt registry',
        needsApproval: true,
      }).client()
      const withoutRegistry = useChat({
        threadId: 'thread-1',
        connection: { connect: async function* () {} },
        tools: clientTools(existingTool),
      })
      type WithoutRegistry = (typeof withoutRegistry.interrupts)[number]
      type ExistingToolInterrupt = Extract<
        WithoutRegistry,
        { kind: 'tool-approval' }
      >
      type UnregisteredGeneric = Extract<WithoutRegistry, { kind: 'generic' }>
      expectTypeOf<
        ExistingToolInterrupt['toolName']
      >().toEqualTypeOf<'preact-unregistered-tool'>()
      expectTypeOf<
        Parameters<UnregisteredGeneric['resolveInterrupt']>[0]
      >().toEqualTypeOf<unknown>()
    }
    void check
  })
})

describe('useChat() activity types', () => {
  const progressSchema: TestSchema<{ step: number; total: number }> = {
    '~standard': {
      version: 1,
      vendor: 'test',
      types: {
        input: { step: 0, total: 0 },
        output: { step: 0, total: 0 },
      },
      validate: () => ({ value: { step: 0, total: 0 } }),
      jsonSchema: { input: () => ({ type: 'object' }) },
    },
  }
  const deployProgress = defineActivityType({
    activityType: 'deploy.progress',
    contentSchema: progressSchema,
  })
  const connection = { connect: async function* () {} }

  it('narrows a built-in activity type with no `activities`', () => {
    const check = () => {
      const { messages } = useChat({ threadId: 'thread-1', connection })
      const part = messages[0]?.parts[0]
      if (part?.type === 'activity' && part.activityType === 'sandbox.status') {
        expectTypeOf(part.content.status).toEqualTypeOf<
          'starting' | 'ready' | 'failed'
        >()
      }
    }
    void check
  })

  it('narrows a type from `activities`, also through createChatHook', () => {
    const check = () => {
      const { messages } = useChat({
        threadId: 'thread-1',
        connection,
        activities: [deployProgress],
      })
      const part = messages[0]?.parts[0]
      if (
        part?.type === 'activity' &&
        part.activityType === 'deploy.progress'
      ) {
        expectTypeOf(part.content).toEqualTypeOf<{
          step: number
          total: number
        }>()
      }

      const { useChat: useBoundChat } = createChatHook({
        connection,
        activities: [deployProgress],
      })
      const bound = useBoundChat({ threadId: 'thread-1' })
      const boundPart = bound.messages[0]?.parts[0]
      if (
        boundPart?.type === 'activity' &&
        boundPart.activityType === 'deploy.progress'
      ) {
        expectTypeOf(boundPart.content.total).toEqualTypeOf<number>()
      }
    }
    void check
  })
})
