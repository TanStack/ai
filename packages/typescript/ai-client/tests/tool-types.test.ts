import { describe, it, expectTypeOf } from 'vitest'
import { z } from 'zod'
import type { UIMessage, ToolCallPart, InferChatMessages } from '../src/types'
import { createChatClientOptions } from '../src/types'
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
              // Should NOT have cart properties
              expectTypeOf(part.output).not.toHaveProperty('success')
              expectTypeOf(part.output).not.toHaveProperty('cartId')
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
              // Should NOT have guitar properties
              expectTypeOf(part.output).not.toHaveProperty('id')
              expectTypeOf(part.output).not.toHaveProperty('name')
              expectTypeOf(part.output).not.toHaveProperty('price')
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

          // Should NOT be any
          expectTypeOf(part.output).not.toBeAny()
        }
      }
    }
  })
})
