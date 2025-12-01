import { tool } from '@tanstack/ai'
import { z } from 'zod'
import guitars from '@/data/example-guitars'

export const getGuitarsTool = tool({
  name: 'getGuitars',
  description: 'Get all products from the database',
  inputSchema: z.object({}),
  execute: async () => {
    return guitars
  },
})

export const recommendGuitarTool = tool({
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
})

export const getPersonalGuitarPreferenceTool = tool({
  name: 'getPersonalGuitarPreference',
  description:
    "Get the user's guitar preference from their local browser storage",
  inputSchema: z.object({}),
  // No execute = client-side tool
})

export const addToWishListTool = tool({
  name: 'addToWishList',
  description: "Add a guitar to the user's wish list (requires approval)",
  inputSchema: z.object({
    guitarId: z.string(),
  }),
  needsApproval: true,
  // No execute = client-side but needs approval
})

export const addToCartTool = tool({
  name: 'addToCart',
  description: 'Add a guitar to the shopping cart (requires approval)',
  inputSchema: z.object({
    guitarId: z.string(),
    quantity: z.number(),
  }),
  needsApproval: true,
  execute: async (args) => {
    return {
      success: true,
      cartId: 'CART_' + Date.now(),
      guitarId: args.guitarId,
      quantity: args.quantity,
      totalItems: args.quantity,
    }
  },
})

export const allTools = [
  getGuitarsTool,
  recommendGuitarTool,
  getPersonalGuitarPreferenceTool,
  addToWishListTool,
  addToCartTool,
]
