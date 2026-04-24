import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { openRouterText } from '@tanstack/ai-openrouter'
import { z } from 'zod'

const GuitarRecommendationSchema = z.object({
  title: z.string().describe('Short headline for the recommendation'),
  summary: z.string().describe('One paragraph summary'),
  recommendations: z
    .array(
      z.object({
        name: z.string(),
        brand: z.string(),
        type: z.enum(['acoustic', 'electric', 'bass', 'classical']),
        priceRangeUsd: z.object({ min: z.number(), max: z.number() }),
        reason: z.string(),
      }),
    )
    .min(1)
    .describe('Guitar recommendations with reasons'),
  nextSteps: z.array(z.string()).describe('Practical follow-up actions'),
})

export const Route = createFileRoute('/api/structured-output')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, model } = body as {
          prompt: string
          model?: string
        }

        try {
          const result = await chat({
            adapter: openRouterText(
              (model || 'openai/gpt-5.2') as 'openai/gpt-5.2',
            ),
            messages: [{ role: 'user', content: prompt }],
            outputSchema: GuitarRecommendationSchema,
          })

          return new Response(JSON.stringify({ data: result }), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : 'An error occurred'
          console.error('[api/structured-output] Error:', error)
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
