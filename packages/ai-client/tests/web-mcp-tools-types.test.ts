import { describe, expectTypeOf, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai/client'
import {
  registerWebMCPTools,
  type RegisterWebMCPToolsOptions,
  type WebMCPToolAnnotations,
  type WebMCPToolOptions,
} from '../src'

const controller = new AbortController()
const search = toolDefinition({
  name: 'search_products',
  description: 'Search products',
}).client(async () => [])
const addToCart = toolDefinition({
  name: 'add_to_cart',
  description: 'Add a product to the cart',
}).client(async () => ({ ok: true }))
const tools = [search, addToCart] as const

describe('registerWebMCPTools types', () => {
  it('requires a lifecycle signal', () => {
    // @ts-expect-error signal is required
    registerWebMCPTools(tools, {})
  })

  it('keys per-tool options by inferred tool names', () => {
    const options: RegisterWebMCPToolsOptions<typeof tools> = {
      signal: controller.signal,
      toolOptions: {
        search_products: {
          title: 'Search products',
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: true,
          },
        },
        add_to_cart: { title: 'Add to cart' },
      },
    }

    expectTypeOf(options.toolOptions?.search_products).toEqualTypeOf<
      WebMCPToolOptions | undefined
    >()
    expectTypeOf(
      options.toolOptions?.search_products?.annotations,
    ).toEqualTypeOf<WebMCPToolAnnotations | undefined>()

    registerWebMCPTools(tools, {
      signal: controller.signal,
      toolOptions: {
        // @ts-expect-error tool options only accept names from the tool list
        unknown_tool: {},
      },
    })
  })

  it('requires the runtime context inferred from contextual tools', () => {
    const contextual = toolDefinition({
      name: 'contextual',
      description: 'Read tenant context',
    }).client<{ tenantId: string }>((_input, executionContext) => {
      return executionContext.context.tenantId
    })

    // @ts-expect-error contextual tools require context
    registerWebMCPTools([contextual], { signal: controller.signal })

    registerWebMCPTools([contextual], {
      signal: controller.signal,
      context: { tenantId: 'tenant-1' },
    })

    registerWebMCPTools([contextual], {
      signal: controller.signal,
      // @ts-expect-error context must satisfy every contextual tool
      context: { accountId: 'account-1' },
    })
  })

  it('does not expose cross-origin registration options', () => {
    registerWebMCPTools(tools, {
      signal: controller.signal,
      // @ts-expect-error cross-origin exposure is not supported
      exposedTo: ['https://agent.example'],
    })
  })
})
