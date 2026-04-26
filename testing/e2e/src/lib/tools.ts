import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import guitars from '@/lib/guitar-data'

export const getGuitarsToolDef = toolDefinition({
  name: 'getGuitars',
  description: 'Get all guitars from inventory',
  inputSchema: z.object({}),
  outputSchema: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      shortDescription: z.string(),
      price: z.number(),
    }),
  ),
})

export const getGuitars = getGuitarsToolDef.server(() => {
  return guitars.map((g) => ({
    id: g.id,
    name: g.name,
    shortDescription: g.shortDescription,
    price: g.price,
  }))
})

export const compareGuitarsToolDef = toolDefinition({
  name: 'compareGuitars',
  description: 'Compare two or more guitars side by side',
  inputSchema: z.object({
    guitarIds: z.array(z.number()).min(2),
  }),
  outputSchema: z.object({
    comparison: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        price: z.number(),
      }),
    ),
    cheapest: z.string(),
    mostExpensive: z.string(),
  }),
})

export const compareGuitars = compareGuitarsToolDef.server((args) => {
  const selected = args.guitarIds
    .map((id) => guitars.find((g) => g.id === id))
    .filter(Boolean) as typeof guitars

  if (selected.length === 0) {
    return { comparison: [], cheapest: 'N/A', mostExpensive: 'N/A' }
  }

  const prices = selected.map((g) => g.price)
  return {
    comparison: selected.map((g) => ({
      id: g.id,
      name: g.name,
      price: g.price,
    })),
    cheapest: selected.find((g) => g.price === Math.min(...prices))!.name,
    mostExpensive: selected.find((g) => g.price === Math.max(...prices))!.name,
  }
})

export const addToCartToolDef = toolDefinition({
  name: 'addToCart',
  description: 'Add a guitar to the shopping cart',
  inputSchema: z.object({
    guitarId: z.string(),
    quantity: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    cartId: z.string(),
    guitarId: z.string(),
    quantity: z.number(),
  }),
  needsApproval: true,
})

export const addToCart = addToCartToolDef.server((args) => ({
  success: true,
  cartId: 'CART_' + Date.now(),
  guitarId: args.guitarId,
  quantity: args.quantity,
}))
