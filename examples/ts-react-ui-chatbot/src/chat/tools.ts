import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

export const lookupPlace = toolDefinition({
  name: 'lookupPlace',
  description: 'Look up a place, weather, and citation links.',
  inputSchema: z.object({ city: z.string() }),
  outputSchema: z.object({
    city: z.string(),
    blurb: z.string(),
    sources: z.array(z.object({ title: z.string(), url: z.string() })),
  }),
})

export const bookStay = toolDefinition({
  name: 'bookStay',
  description: 'Hold a hotel or guesthouse. Needs approval before it runs.',
  needsApproval: true,
  inputSchema: z.object({
    city: z.string(),
    nights: z.number(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    confirmation: z.string(),
  }),
})

export const confirmPayment = toolDefinition({
  name: 'confirmPayment',
  description:
    'Demo hold for a trip amount. Call this when the user asks to pay or hold a charge. Not a real card charge.',
  needsApproval: true,
  inputSchema: z.object({
    city: z.string(),
    amount: z.number(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    receipt: z.string(),
  }),
})

export const clientTools = [
  lookupPlace.client(),
  bookStay.client(),
  confirmPayment.client(),
]
