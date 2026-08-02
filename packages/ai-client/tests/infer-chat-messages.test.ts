/**
 * Round-trip type-safety tests for `InferChatMessages`.
 *
 * Proves that the type flow:
 *   `createChatClientOptions({ tools }) -> ChatClientOptions<TTools>`
 *   `-> InferChatMessages<...> -> Array<UIMessage<TTools>>`
 * preserves tool input/output types through to message-array consumers
 * (e.g., React/Vue/Solid `useChat()` callers).
 *
 * Compile-time only — no runtime assertions beyond `expectTypeOf<>()`.
 */
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai/client'
import { createChatClientOptions } from '../src/types'
import type {
  ChatClientOptions,
  InferChatMessages,
  ToolCallPart,
  UIMessage,
} from '../src/types'

// ===========================
// Tool fixtures
// ===========================

const guitarTool = toolDefinition({
  name: 'getGuitar',
  description: 'Get guitar info',
  inputSchema: z.object({ id: z.string() }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
  }),
}).client((args) => ({ id: args.id, name: 'Test Guitar', price: 1000 }))

const cartTool = toolDefinition({
  name: 'addToCart',
  description: 'Add to cart',
  inputSchema: z.object({ guitarId: z.string(), quantity: z.number() }),
  outputSchema: z.object({ success: z.boolean(), cartId: z.string() }),
}).client(() => ({ success: true, cartId: 'cart-123' }))

// Minimal connection stub — required by ChatClientOptions but irrelevant
// at the type level for these assertions.
const stubConnection = {
  // eslint-disable-next-line @typescript-eslint/require-await
  connect: async function* () {
    // never yields anything; type-only stub
  },
}

// ===========================
// Round-trip identity assertions
// ===========================

describe('InferChatMessages — round-trip identity', () => {
  it('resolves to Array<UIMessage<TTools>> for a populated tools tuple', () => {
    const options = createChatClientOptions({
      connection: stubConnection,
      tools: [guitarTool, cartTool] as const,
    })

    type Messages = InferChatMessages<typeof options>

    expectTypeOf<Messages>().toEqualTypeOf<
      Array<UIMessage<readonly [typeof guitarTool, typeof cartTool]>>
    >()
  })

  it('resolves to Array<UIMessage<readonly []>> when no tools are present', () => {
    const options = createChatClientOptions({
      connection: stubConnection,
      tools: [] as const,
    })

    type Messages = InferChatMessages<typeof options>

    expectTypeOf<Messages>().toEqualTypeOf<Array<UIMessage<readonly []>>>()
  })

  it('produces `never` when given a non-options input', () => {
    expectTypeOf<
      InferChatMessages<{ notAnOptions: true }>
    >().toEqualTypeOf<never>()
    expectTypeOf<InferChatMessages<string>>().toEqualTypeOf<never>()
    expectTypeOf<InferChatMessages<undefined>>().toEqualTypeOf<never>()
  })

  it('preserves tools tuple when options are constructed manually', () => {
    type ManualOptions = ChatClientOptions<readonly [typeof guitarTool]>

    expectTypeOf<InferChatMessages<ManualOptions>>().toEqualTypeOf<
      Array<UIMessage<readonly [typeof guitarTool]>>
    >()
  })
})

// ===========================
// Tool input → tool-call args propagation
// ===========================

describe('InferChatMessages — tool input types propagate to tool-call parts', () => {
  it('narrows tool-call `name` to the literal tool names', () => {
    const options = createChatClientOptions({
      connection: stubConnection,
      tools: [guitarTool, cartTool] as const,
    })

    type Messages = InferChatMessages<typeof options>
    const messages = [] as Messages
    const message = messages[0]

    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool-call') {
          expectTypeOf(part.name).toEqualTypeOf<'getGuitar' | 'addToCart'>()
        }
      }
    }
  })

  it('narrows tool-call `input` based on `name` discriminator', () => {
    const options = createChatClientOptions({
      connection: stubConnection,
      tools: [guitarTool, cartTool] as const,
    })

    type Messages = InferChatMessages<typeof options>
    const messages = [] as Messages
    const message = messages[0]

    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool-call') {
          if (part.name === 'getGuitar' && part.input) {
            // `getGuitar` input schema: { id: string }
            expectTypeOf(part.input).toMatchTypeOf<{ id: string }>()
          }
          if (part.name === 'addToCart' && part.input) {
            // `addToCart` input schema: { guitarId: string; quantity: number }
            expectTypeOf(part.input).toMatchTypeOf<{
              guitarId: string
              quantity: number
            }>()
          }
        }
      }
    }
  })
})

// ===========================
// Tool output → tool-call output propagation
// ===========================

describe('InferChatMessages — tool output types propagate to tool-call parts', () => {
  it('narrows tool-call `output` based on `name` discriminator', () => {
    const options = createChatClientOptions({
      connection: stubConnection,
      tools: [guitarTool, cartTool] as const,
    })

    type Messages = InferChatMessages<typeof options>
    const messages = [] as Messages
    const message = messages[0]

    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool-call') {
          if (part.name === 'getGuitar' && part.output) {
            expectTypeOf(part.output).toMatchTypeOf<{
              id: string
              name: string
              price: number
            }>()
          }
          if (part.name === 'addToCart' && part.output) {
            expectTypeOf(part.output).toMatchTypeOf<{
              success: boolean
              cartId: string
            }>()
          }
        }
      }
    }
  })

  it('output is `undefined | TOutput` until the tool resolves', () => {
    const options = createChatClientOptions({
      connection: stubConnection,
      tools: [guitarTool] as const,
    })

    type Messages = InferChatMessages<typeof options>
    const messages = [] as Messages
    const message = messages[0]

    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool-call' && part.name === 'getGuitar') {
          // Pre-narrowing: output is `T | undefined`.
          type ExpectedOutput =
            | { id: string; name: string; price: number }
            | undefined
          expectTypeOf(part.output).toMatchTypeOf<ExpectedOutput>()
        }
      }
    }
  })
})

// ===========================
// Untyped (any-tools) fallback path
// ===========================

describe('InferChatMessages — untyped fallback', () => {
  it('default `UIMessage` (without tool generic) accepts any tool-call shape', () => {
    // Note: bare UIMessage with no tools arg falls back to `UIMessage<any>`,
    // matching the runtime where the caller has not pinned tool types.
    const messages = [] as Array<UIMessage>
    const message = messages[0]

    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool-call') {
          // `name` is the wide string type — no narrowing available.
          expectTypeOf(part.name).toEqualTypeOf<string>()
        }
      }
    }
  })
})

// ===========================
// Approval gating: `approval` present only for needsApproval tools
// ===========================

const approvalTool = toolDefinition({
  name: 'deleteAccount',
  description: 'Delete the account (needs approval)',
  inputSchema: z.object({ accountId: z.string() }),
  outputSchema: z.object({ deleted: z.boolean() }),
  needsApproval: true,
}).client(() => ({ deleted: true }))

describe('InferChatMessages — approval gating', () => {
  it('exposes `approval` only on tools declared with `needsApproval: true`', () => {
    const options = createChatClientOptions({
      connection: stubConnection,
      tools: [guitarTool, approvalTool] as const,
    })

    type Messages = InferChatMessages<typeof options>
    const messages = [] as Messages
    const message = messages[0]

    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool-call') {
          if (part.name === 'deleteAccount') {
            // Approval tool → `approval` metadata is accessible + typed.
            expectTypeOf(part.approval).toMatchTypeOf<
              | { id: string; needsApproval: boolean; approved?: boolean }
              | undefined
            >()
          }
          if (part.name === 'getGuitar') {
            // Non-approval tool → the `approval` field does not exist on the
            // part. This @ts-expect-error is the bidirectional guard: if the
            // gate regressed and `approval` reappeared, this directive would
            // become unused and fail the type-check.
            // @ts-expect-error - `approval` is gated behind `needsApproval: true`
            void part.approval
          }
        }
      }
    }
  })

  // Escape hatch 1: a GENERIC approval handler over a typed, mixed tool union.
  // Blindly reading `part.approval` off the union is a compile error, but an
  // `'approval' in part` guard narrows to the approval-bearing members.
  it('supports a generic handler via `in` narrowing on the typed union', () => {
    const options = createChatClientOptions({
      connection: stubConnection,
      tools: [guitarTool, approvalTool] as const,
    })
    const messages = [] as InferChatMessages<typeof options>
    const message = messages[0]

    if (message?.role === 'assistant') {
      for (const part of message.parts) {
        if (part.type === 'tool-call' && 'approval' in part && part.approval) {
          expectTypeOf(part.approval.id).toEqualTypeOf<string>()
        }
      }
    }
  })

  // Escape hatch 2: type the reusable handler against the base `ToolCallPart`
  // (default/untyped), which always carries `approval?` — so a shared approval
  // component works across every tool regardless of the caller's tool union.
  it('supports a generic handler typed against the base ToolCallPart', () => {
    const handleApproval = (part: ToolCallPart) => part.approval?.id
    expectTypeOf(handleApproval).returns.toEqualTypeOf<string | undefined>()
  })
})
