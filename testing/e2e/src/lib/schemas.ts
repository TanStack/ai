import { z } from 'zod'

export const guitarRecommendationSchema = z.object({
  name: z.string(),
  price: z.number(),
  reason: z.string(),
  rating: z.number().min(1).max(5),
  // Optional field used to exercise strict-mode null-widening end to end:
  // the schema converter widens this to `required` + nullable, so a provider
  // returns `null` for an absent value. The engine must undo that widening so
  // the field reads back as ABSENT (matching `.optional()`), not `null`. See
  // `structured-output-stream.spec.ts`.
  condition: z.string().optional(),
})

export const imageAnalysisSchema = z.object({
  description: z.string(),
  objects: z.array(z.string()),
  mood: z.string(),
})

/**
 * Recipe schema for the `multi-turn-structured` e2e feature. Mirrors the
 * example app's RecipeSchema in
 * `examples/ts-react-chat/src/routes/api.structured-chat.ts` so the harness
 * exercises the same shape end users see in the demo.
 *
 * Constraints (`min`, `int`, `default`) are intentionally avoided — OpenAI
 * strict structured outputs reject `integer`, `minimum`/`maximum`,
 * `minLength`/`maxLength`, `minItems`/`maxItems`, and `default`.
 */
export const recipeSchema = z.object({
  title: z.string(),
  cuisine: z.string(),
  servings: z.number(),
  estimatedCostUsd: z.number(),
  ingredients: z.array(
    z.object({
      item: z.string(),
      amount: z.string(),
    }),
  ),
  steps: z.array(z.string()),
  tips: z.array(z.string()),
})

export type Recipe = z.infer<typeof recipeSchema>
