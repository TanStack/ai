import { defineInterrupt } from '@tanstack/ai'
import { z } from 'zod'

export const BUDGET_OPTIONS = ['thrifty', 'comfort', 'splash'] as const

export const chooseBudget = defineInterrupt({
  id: 'chooseBudget',
  payloadSchema: z.object({
    city: z.string(),
    options: z.array(z.enum(BUDGET_OPTIONS)),
  }),
  responseSchema: z.object({
    budget: z.enum(BUDGET_OPTIONS),
  }),
})

export const chatInterrupts = [chooseBudget]
