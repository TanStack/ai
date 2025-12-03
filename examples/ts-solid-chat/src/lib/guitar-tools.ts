import { toolDefinition } from '@tanstack/ai'
import { clientTools as createClientTools } from '@tanstack/ai-client'
import { z } from 'zod'
import guitars from '@/data/example-guitars'

// Tool definition for getting guitars
export const getGuitarsToolDef = toolDefinition({
  name: 'getGuitars',
  description: 'Get all products from the database',
  inputSchema: z.object({}),
  outputSchema: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      image: z.string(),
      description: z.string(),
      shortDescription: z.string(),
      price: z.number(),
    }),
  ),
})

// Server implementation
export const getGuitars = getGuitarsToolDef.server(() => guitars)

// Tool definition for guitar recommendation
export const recommendGuitarTool = toolDefinition({
  name: 'recommendGuitar',
  description:
    'REQUIRED tool to display a guitar recommendation to the user. This tool MUST be used whenever recommending a guitar - do NOT write recommendations yourself. This displays the guitar in a special appealing format with a buy button.',
  inputSchema: z.object({
    id: z
      .string()
      .describe(
        'The ID of the guitar to recommend (from the getGuitars results)',
      ),
  }),
  outputSchema: z.object({
    id: z.string(),
  }),
})

export const recommendGuitarToolClient = recommendGuitarTool.client(
  async (args) => {
    return { id: args.id }
  },
)

// Tool definition for personal preference
export const getPersonalGuitarPreferenceTool = toolDefinition({
  name: 'getPersonalGuitarPreference',
  description:
    "Get the user's guitar preference from their local browser storage",
  inputSchema: z.object({}),
  outputSchema: z.object({
    preference: z.string(),
  }),
})

export const getPersonalGuitarPreferenceToolClient =
  getPersonalGuitarPreferenceTool.client(async () => {
    return { preference: 'acoustic' }
  })

// Tool definition for wish list (needs approval)
export const addToWishListTool = toolDefinition({
  name: 'addToWishList',
  description: "Add a guitar to the user's wish list (requires approval)",
  inputSchema: z.object({
    guitarId: z.string(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    guitarId: z.string(),
    totalItems: z.number(),
  }),
  needsApproval: true,
})

export const addToWishListToolClient = addToWishListTool.client((args) => {
  const wishList = JSON.parse(localStorage.getItem('wishList') || '[]')
  wishList.push(args.guitarId)
  localStorage.setItem('wishList', JSON.stringify(wishList))
  return {
    success: true,
    guitarId: args.guitarId,
    totalItems: wishList.length,
  }
})

// Tool definition for add to cart (server + client)
export const addToCartTool = toolDefinition({
  name: 'addToCart',
  description: 'Add a guitar to the shopping cart (requires approval)',
  inputSchema: z.object({
    guitarId: z.string(),
    quantity: z.number(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    cartId: z.string(),
    guitarId: z.string(),
    quantity: z.number(),
    totalItems: z.number(),
  }),
  needsApproval: true,
})

export const addToCartToolServer = addToCartTool.server(async (args) => {
  return {
    success: true,
    cartId: 'CART_' + Date.now(),
    guitarId: args.guitarId,
    quantity: args.quantity,
    totalItems: args.quantity,
  }
})

export const addToCartToolClient = addToCartTool.client(async (args) => {
  return {
    success: true,
    cartId: 'CART_CLIENT_' + Date.now(),
    guitarId: args.guitarId,
    quantity: args.quantity,
    totalItems: args.quantity,
  }
})

// Server tools array - can use definitions directly or server implementations
export const serverTools = [
  getGuitars, // Server tool
  recommendGuitarTool, // Definition without execute - server will see it but won't call
  getPersonalGuitarPreferenceTool, // Definition for client
  addToWishListTool, // Definition for approval flow
  addToCartToolServer,
]

// Client tools array with proper type inference
export const clientTools = createClientTools(
  recommendGuitarToolClient,
  getPersonalGuitarPreferenceToolClient,
  addToWishListToolClient,
  addToCartToolClient,
)
