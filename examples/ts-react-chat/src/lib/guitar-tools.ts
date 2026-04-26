import { toolDefinition } from '@tanstack/ai'
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
export const getGuitars = getGuitarsToolDef.server((_, context) => {
  context?.emitCustomEvent('tool:progress', {
    tool: 'getGuitars',
    message: `Fetching ${guitars.length} guitars from inventory`,
  })
  return guitars
})

// Tool definition for guitar recommendation
export const recommendGuitarToolDef = toolDefinition({
  name: 'recommendGuitar',
  description:
    'REQUIRED tool to display a guitar recommendation to the user. This tool MUST be used whenever recommending a guitar - do NOT write recommendations yourself. This displays the guitar in a special appealing format with a buy button.',
  inputSchema: z.object({
    id: z
      .union([z.string(), z.number()])
      .describe(
        'The ID of the guitar to recommend (from the getGuitars results)',
      ),
  }),
  outputSchema: z.object({
    id: z.number(),
  }),
})

// Tool definition for personal preference
export const getPersonalGuitarPreferenceToolDef = toolDefinition({
  name: 'getPersonalGuitarPreference',
  description:
    "Get the user's guitar preference from their local browser storage",
  inputSchema: z.object({}),
  outputSchema: z.object({
    preference: z.string(),
  }),
})

// Tool definition for wish list (needs approval)
export const addToWishListToolDef = toolDefinition({
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

// Tool definition for add to cart (server + client)
export const addToCartToolDef = toolDefinition({
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

// --- Lazy tools (discovered on demand) ---

// Compare two or more guitars side by side
export const compareGuitarsToolDef = toolDefinition({
  name: 'compareGuitars',
  description:
    'Compare two or more guitars side by side, showing their differences in price, type, and features.',
  inputSchema: z.object({
    guitarIds: z
      .array(z.number())
      .min(2)
      .describe('Array of guitar IDs to compare (minimum 2)'),
  }),
  outputSchema: z.object({
    comparison: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        price: z.number(),
        description: z.string(),
        priceDifference: z.string(),
      }),
    ),
    cheapest: z.string(),
    mostExpensive: z.string(),
  }),
  lazy: true,
})

export const compareGuitars = compareGuitarsToolDef.server((args) => {
  const selected = args.guitarIds
    .map((id) => guitars.find((g) => g.id === id))
    .filter(Boolean) as (typeof guitars)[number][]

  const prices = selected.map((g) => g.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)

  return {
    comparison: selected.map((g) => ({
      id: g.id,
      name: g.name,
      price: g.price,
      description: g.shortDescription,
      priceDifference:
        g.price === minPrice
          ? 'Cheapest'
          : `+$${g.price - minPrice} more than cheapest`,
    })),
    cheapest: selected.find((g) => g.price === minPrice)!.name,
    mostExpensive: selected.find((g) => g.price === maxPrice)!.name,
  }
})

// Calculate monthly financing for a guitar
export const calculateFinancingToolDef = toolDefinition({
  name: 'calculateFinancing',
  description:
    'Calculate monthly payment plans for a guitar purchase. Supports 6, 12, and 24 month terms.',
  inputSchema: z.object({
    guitarId: z
      .number()
      .describe('The ID of the guitar to calculate financing for'),
    months: z
      .number()
      .describe('Number of months for the payment plan (6, 12, or 24)'),
  }),
  outputSchema: z.object({
    guitarName: z.string(),
    totalPrice: z.number(),
    months: z.number(),
    monthlyPayment: z.number(),
    apr: z.number(),
    totalWithInterest: z.number(),
  }),
  lazy: true,
})

export const calculateFinancing = calculateFinancingToolDef.server((args) => {
  const guitar = guitars.find((g) => g.id === args.guitarId)
  if (!guitar) {
    throw new Error(`Guitar with ID ${args.guitarId} not found`)
  }

  const apr = args.months <= 6 ? 0 : args.months <= 12 ? 5.9 : 9.9
  const monthlyRate = apr / 100 / 12
  const monthlyPayment =
    apr === 0
      ? guitar.price / args.months
      : (guitar.price * monthlyRate) /
        (1 - Math.pow(1 + monthlyRate, -args.months))

  return {
    guitarName: guitar.name,
    totalPrice: guitar.price,
    months: args.months,
    monthlyPayment: Math.round(monthlyPayment * 100) / 100,
    apr,
    totalWithInterest: Math.round(monthlyPayment * args.months * 100) / 100,
  }
})

// Search guitars by features/keywords
export const searchGuitarsToolDef = toolDefinition({
  name: 'searchGuitars',
  description:
    'Search guitars by keyword in their name or description. Useful for finding guitars matching specific features like "acoustic", "electric", "LED", "vintage", etc.',
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        'Search keyword or phrase to match against guitar names and descriptions',
      ),
  }),
  outputSchema: z.object({
    results: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        price: z.number(),
        shortDescription: z.string(),
        matchedIn: z.string(),
      }),
    ),
    totalFound: z.number(),
  }),
  lazy: true,
})

export const searchGuitars = searchGuitarsToolDef.server((args) => {
  const query = args.query.toLowerCase()
  const results = guitars
    .filter(
      (g) =>
        g.name.toLowerCase().includes(query) ||
        g.description.toLowerCase().includes(query),
    )
    .map((g) => ({
      id: g.id,
      name: g.name,
      price: g.price,
      shortDescription: g.shortDescription,
      matchedIn: g.name.toLowerCase().includes(query) ? 'name' : 'description',
    }))

  return {
    results,
    totalFound: results.length,
  }
})
