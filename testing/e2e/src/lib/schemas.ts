import { z } from 'zod'

export const guitarRecommendationSchema = z.object({
  name: z.string(),
  price: z.number(),
  reason: z.string(),
  rating: z.number().min(1).max(5),
})

export const imageAnalysisSchema = z.object({
  description: z.string(),
  objects: z.array(z.string()),
  mood: z.string(),
})
