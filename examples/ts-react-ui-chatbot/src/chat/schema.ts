import { z } from 'zod'

export const itinerarySchema = z.object({
  title: z.string(),
  summary: z.string(),
  days: z.array(
    z.object({
      label: z.string(),
      plan: z.string(),
    }),
  ),
})
