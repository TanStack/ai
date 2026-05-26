import { describe, it, expectTypeOf } from 'vitest'
import { z } from 'zod'
import type { UIMessage, ToolCallPart, InferChatMessages } from '../src/types'
import { clientTools, createChatClientOptions } from '../src/types'
import { ChatClient } from '../src/chat-client'
import { toolDefinition } from '@tanstack/ai'

// Define some test tools
const guitarTool = toolDefinition({
  name: 'getGuitar',
  description: 'Get guitar info',
  inputSchema: z.object({
    id: z.string(),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
  }),
})

const cartTool = toolDefinition({
  name: 'addToCart',
  description: 'Add to cart',
  inputSchema: z.object({
    guitarId: z.string(),
    quantity: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    cartId: z.string(),
  }),
})

const recommendTool = toolDefinition({
  name: 'recommend',
  description: 'Get recommendations',
  inputSchema: z.object({}),
  outputSchema: z.object({
    preference: z.string(),
  }),
})

// Create tool instances for typing
const guitarToolClient = guitarTool.client((args) => ({
  id: args.id,
  name: 'Test Guitar',
  price: 1000,
}))

const cartToolClient = cartTool.client(() => ({
  success: true,
  cartId: 'cart-123',
}))

const recommendToolClient = recommendTool.client(() => ({
  preference: 'rock',
}))

describe('Tool Type Narrowing', () => {
  it('types ChatClient message APIs from registered tools', () => {
    const client = new ChatClient({
      connection: {
        async *connect() {},
      },
      tools: [guitarToolClient] as const,
    })

    const messages = client.getMessages()
    expectTypeOf(messages).toEqualTypeOf<
      Array<UIMessage<readonly [typeof guitarToolClient]>>
    >()

    client.setMessagesManually(messages)

    client.setMessagesManually([
      {
        id: 'm1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'tc-1',
            name: 'getGuitar',
            arguments: '{}',
            state: 'complete',
            input: { id: 'g1' },
            output: { id: 'g1', name: 'Strat', price: 1000 },
          },
        ],
      },
    ])

    client.setMessagesManually([
      {
        id: 'm2',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'tc-2',
            // @ts-expect-error - tool name must come from registered tools
            name: 'addToCart',
            arguments: '{}',
            state: 'input-complete',
            input: { id: 'g1' },
          },
        ],
      },
    ])
  })

  it('should correctly narrow part.name type', () => {
    const messages: Array<
      UIMessage<
        readonly [
          typeof guitarToolClient,
          typeof cartToolClient,
          typeof recommendToolClient,
        ]
      >
    > = []

    // Simulate a message with tool calls
    const message = messages[0]
    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool-call') {
          // Test type narrowing for each tool name
          if (part.name === 'getGuitar') {
            expectTypeOf(part.name).toEqualTypeOf<'getGuitar'>()
            // TypeScript should know part.name is literally 'getGuitar' here
          }

          if (part.name === 'addToCart') {
            expectTypeOf(part.name).toEqualTypeOf<'addToCart'>()
          }

          if (part.name === 'recommend') {
            expectTypeOf(part.name).toEqualTypeOf<'recommend'>()
          }
        }
      }
    }
  })

  it('should correctly type ToolCallPart discriminated union', () => {
    type TestToolCallPart = ToolCallPart<
      readonly [
        typeof guitarToolClient,
        typeof cartToolClient,
        typeof recommendToolClient,
      ]
    >

    // Test that the union correctly narrows based on name
    type GuitarCallPart = Extract<TestToolCallPart, { name: 'getGuitar' }>
    type CartCallPart = Extract<TestToolCallPart, { name: 'addToCart' }>
    type RecommendCallPart = Extract<TestToolCallPart, { name: 'recommend' }>

    // Verify the name types are literal strings
    expectTypeOf<GuitarCallPart['name']>().toEqualTypeOf<'getGuitar'>()
    expectTypeOf<CartCallPart['name']>().toEqualTypeOf<'addToCart'>()
    expectTypeOf<RecommendCallPart['name']>().toEqualTypeOf<'recommend'>()

    // Verify that output exists on each part
    expectTypeOf<GuitarCallPart>().toHaveProperty('output')
    expectTypeOf<CartCallPart>().toHaveProperty('output')
    expectTypeOf<RecommendCallPart>().toHaveProperty('output')
  })

  it('should narrow types in a realistic message rendering scenario', () => {
    // This simulates what happens in a React/Solid component
    type Messages = Array<
      UIMessage<readonly [typeof guitarToolClient, typeof cartToolClient]>
    >

    // Declare messages (doesn't need to have actual data for type testing)
    const messages = [] as Messages

    const message = messages[0]
    if (message?.role === 'assistant') {
      message.parts.forEach((part) => {
        if (part.type === 'tool-call') {
          // Before narrowing by name, part.name should be a union
          expectTypeOf(part.name).toEqualTypeOf<'getGuitar' | 'addToCart'>()

          // After narrowing by name, TypeScript should know the specific type
          if (part.name === 'getGuitar') {
            expectTypeOf(part.name).toEqualTypeOf<'getGuitar'>()
            // The output type should be the guitar output type or undefined
            type ExpectedOutput =
              | { id: string; name: string; price: number }
              | undefined
            expectTypeOf(part.output).toMatchTypeOf<ExpectedOutput>()

            // We can access properties that exist on the guitar output
            if (part.output) {
              expectTypeOf(part.output).toHaveProperty('id')
              expectTypeOf(part.output).toHaveProperty('name')
              expectTypeOf(part.output).toHaveProperty('price')
            }
          }

          if (part.name === 'addToCart') {
            expectTypeOf(part.name).toEqualTypeOf<'addToCart'>()
            // The output type should be the cart output type or undefined
            type ExpectedOutput =
              | { success: boolean; cartId: string }
              | undefined
            expectTypeOf(part.output).toMatchTypeOf<ExpectedOutput>()

            // We can access properties that exist on the cart output
            if (part.output) {
              expectTypeOf(part.output).toHaveProperty('success')
              expectTypeOf(part.output).toHaveProperty('cartId')
            }
          }
        }
      })
    }
  })

  it('should work with createChatClientOptions and InferChatMessages', () => {
    // This test verifies the end-to-end type flow from options to messages
    const options = createChatClientOptions({
      connection: {
        connect: async function* () {
          // Mock connection adapter
        },
      },
      tools: [guitarToolClient, cartToolClient] as const,
    })

    type Messages = InferChatMessages<typeof options>

    const messages = [] as Messages
    const message = messages[0]

    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool-call') {
          // Names should be a union of the tool names
          expectTypeOf(part.name).toMatchTypeOf<'getGuitar' | 'addToCart'>()

          if (part.name === 'getGuitar') {
            expectTypeOf(part.name).toEqualTypeOf<'getGuitar'>()
          }
        }
      }
    }
  })

  it('should narrow output type exactly like in the React example', () => {
    // This exactly mimics the pattern in the React example
    const tools = [
      recommendToolClient,
      guitarToolClient,
      cartToolClient,
    ] as const

    const options = createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools,
    })

    type Messages = InferChatMessages<typeof options>
    const messages = [] as Messages

    const message = messages[0]
    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (
          part.type === 'tool-call' &&
          part.name === 'recommend' &&
          part.output
        ) {
          // After this narrowing, part.output should be { preference: string }
          expectTypeOf(part.output).toMatchTypeOf<{ preference: string }>()
          expectTypeOf(part.output).toHaveProperty('preference')
        }
      }
    }
  })

  it('types client tool runtime context from ChatClientOptions', () => {
    type ClientContext = { localUserId: string }
    const tool = toolDefinition({
      name: 'clientContextTool',
      description: 'Uses client context',
    }).client<ClientContext>((_input, ctx) => {
      expectTypeOf(ctx.context.localUserId).toEqualTypeOf<string>()
      return { ok: true }
    })

    const options = createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      context: { localUserId: 'local-1' },
      tools: clientTools(tool),
    })

    expectTypeOf(options.context).toEqualTypeOf<ClientContext>()
  })

  it('preserves client tool context constraints in ChatClient.updateOptions', () => {
    type ClientContext = { localUserId: string }
    const requiredContextTool = toolDefinition({
      name: 'updateOptionsRequiredContextTool',
      description: 'Requires client context',
    }).client<ClientContext>(() => ({ ok: true }))
    const otherRequiredContextTool = toolDefinition({
      name: 'updateOptionsOtherRequiredContextTool',
      description: 'Requires a different client context',
    }).client<{ tenantId: string }>(() => ({ ok: true }))

    const client = new ChatClient({
      connection: {
        async *connect() {},
      },
      tools: clientTools(requiredContextTool),
      context: { localUserId: 'local-1' },
    })

    client.updateOptions({ context: { localUserId: 'local-2' } })
    client.updateOptions({ tools: clientTools(requiredContextTool) })

    client.updateOptions({
      // @ts-expect-error - required client context cannot be cleared
      context: undefined,
    })

    client.updateOptions({
      // @ts-expect-error - updateOptions cannot swap in tools outside TTools
      tools: clientTools(otherRequiredContextTool),
      context: { tenantId: 'tenant-1' },
    })
  })

  it('allows ChatClient.updateOptions to clear optional client context', () => {
    type OptionalContext = { localUserId: string } | undefined
    const optionalContextTool = toolDefinition({
      name: 'updateOptionsOptionalContextTool',
      description: 'Accepts optional client context',
    }).client<OptionalContext>(() => ({ ok: true }))

    const client = new ChatClient({
      connection: {
        async *connect() {},
      },
      tools: clientTools(optionalContextTool),
    })

    client.updateOptions({ context: { localUserId: 'local-1' } })
    client.updateOptions({ context: undefined })
  })

  it('requires context matching typed client tools', () => {
    type ClientContext = { localUserId: string; a: 'literal' }
    const tool = toolDefinition({
      name: 'clientStrictContextTool',
      description: 'Requires strict client context',
    }).client<ClientContext>((_input, ctx) => {
      expectTypeOf(ctx.context.a).toEqualTypeOf<'literal'>()
      return { ok: true }
    })

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: clientTools(tool),
      context: { localUserId: 'local-1', a: 'literal' },
    })

    // @ts-expect-error - context is required when a client tool declares it
    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: clientTools(tool),
    })

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: clientTools(tool),
      // @ts-expect-error - the literal context property is required
      context: { localUserId: 'local-1' },
    })
  })

  it('allows context omission when typed client tools accept undefined', () => {
    type OptionalContext = { localUserId: string } | undefined
    const tool = toolDefinition({
      name: 'clientOptionalContextTool',
      description: 'Accepts optional client context',
    }).client<OptionalContext>((_input, ctx) => {
      expectTypeOf(ctx?.context).toEqualTypeOf<OptionalContext>()
      return { localUserId: ctx?.context?.localUserId ?? null }
    })

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: clientTools(tool),
    })
  })

  it('requires context satisfying every typed client tool', () => {
    type UserContext = { localUserId: string }
    type TenantContext = { tenantId: string }

    const userTool = toolDefinition({
      name: 'clientUserContextTool',
      description: 'Requires user context',
    }).client<UserContext>(() => ({ ok: true }))
    const tenantTool = toolDefinition({
      name: 'clientTenantContextTool',
      description: 'Requires tenant context',
    }).client<TenantContext>(() => ({ ok: true }))

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: clientTools(userTool, tenantTool),
      context: { localUserId: 'local-1', tenantId: 'tenant-1' },
    })

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: clientTools(userTool, tenantTool),
      // @ts-expect-error - tenantId is required by tenantTool
      context: { localUserId: 'local-1' },
    })
  })

  it('requires context satisfying every typed client tool in widened arrays', () => {
    type UserContext = { localUserId: string }
    type TenantContext = { tenantId: string }

    const userTool = toolDefinition({
      name: 'widenedClientUserContextTool',
      description: 'Requires user context',
    }).client<UserContext>(() => ({ ok: true }))
    const tenantTool = toolDefinition({
      name: 'widenedClientTenantContextTool',
      description: 'Requires tenant context',
    }).client<TenantContext>(() => ({ ok: true }))
    const tools: Array<typeof userTool | typeof tenantTool> = [
      userTool,
      tenantTool,
    ]

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools,
      context: { localUserId: 'local-1', tenantId: 'tenant-1' },
    })

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools,
      // @ts-expect-error - widened arrays still require both context shapes
      context: { localUserId: 'local-1' },
    })
  })

  it('handles optional typed client context in widened arrays', () => {
    type UserContext = { localUserId: string }
    type OptionalTenantContext = { tenantId: string } | undefined

    const requiredTool = toolDefinition({
      name: 'widenedClientRequiredContextTool',
      description: 'Requires user context',
    }).client<UserContext>(() => ({ ok: true }))
    const optionalTool = toolDefinition({
      name: 'widenedClientOptionalContextTool',
      description: 'Accepts optional tenant context',
    }).client<OptionalTenantContext>((_input, ctx) => {
      expectTypeOf(ctx?.context).toEqualTypeOf<OptionalTenantContext>()
      return { tenantId: ctx?.context?.tenantId ?? null }
    })

    const mixedTools: Array<typeof requiredTool | typeof optionalTool> = [
      requiredTool,
      optionalTool,
    ]

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: mixedTools,
      context: { localUserId: 'local-1', tenantId: 'tenant-1' },
    })

    // @ts-expect-error - required client tools still force a context value
    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: mixedTools,
    })

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: mixedTools,
      // @ts-expect-error - provided context must satisfy optional tools too
      context: { localUserId: 'local-1' },
    })

    const optionalTools: Array<typeof optionalTool> = [optionalTool]

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: optionalTools,
    })

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: optionalTools,
      context: { tenantId: 'tenant-1' },
    })

    createChatClientOptions({
      connection: {
        connect: async function* () {},
      },
      tools: optionalTools,
      // @ts-expect-error - if context is provided, it must match the typed tools
      context: { localUserId: 'local-1' },
    })
  })
})
