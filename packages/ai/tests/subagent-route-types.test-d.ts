import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import { defineAgent, subagentRoute } from '../src'
import type { DefinedAgent } from '../src'

const skuSchema = z.object({ sku: z.string() })
const topicSchema = z.object({ topic: z.string() })

const agents = [
  defineAgent({
    name: 'researcher',
    description: 'Looks up facts',
    run: async function* () {},
  }),
  defineAgent({
    name: 'pricer',
    description: 'Prices one product',
    inputSchema: skuSchema,
    run: async function* () {},
  }),
  defineAgent({
    name: 'writer',
    description: 'Writes the post',
    inputSchema: topicSchema,
    run: async function* () {},
  }),
] as const

const route = subagentRoute(agents)
declare const result: Parameters<typeof route.pick>[0]

// `needsInput` lists only agents with a schema, each with its own schema.
type Need = ReturnType<typeof route.needsInput>[number]
expectTypeOf<Need['name']>().toEqualTypeOf<'pricer' | 'writer'>()
expectTypeOf<Extract<Need, { name: 'pricer' }>['inputSchema']>().toEqualTypeOf<
  typeof skuSchema
>()

// `inputs` has one optional key for each agent with a schema.
expectTypeOf<
  NonNullable<NonNullable<Parameters<typeof route.pick>[1]>['inputs']>
>().toEqualTypeOf<{ pricer?: { sku: string }; writer?: { topic: string } }>()

route.pick(result, {
  inputs: { pricer: { sku: 'A-1' }, writer: { topic: 'Pricing' } },
})
route.pick(result, { inputs: { pricer: { sku: 'A-1' } } })
route.pick(result)

route.pick(result, {
  // @ts-expect-error researcher has no inputSchema, so it takes no input
  inputs: { researcher: { sku: 'A-1' } },
})

route.pick(result, {
  inputs: {
    // @ts-expect-error the pricer input is { sku: string }
    pricer: { topic: 'Pricing' },
  },
})

// A list with the wide agent type takes an input for any name.
declare const wideAgents: ReadonlyArray<DefinedAgent>
const wideRoute = subagentRoute(wideAgents)
declare const wideResult: Parameters<typeof wideRoute.pick>[0]
wideRoute.pick(wideResult, { inputs: { pricer: { sku: 'A-1' } } })
