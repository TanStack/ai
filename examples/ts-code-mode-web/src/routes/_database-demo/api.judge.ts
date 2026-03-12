import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { anthropicText } from '@tanstack/ai-anthropic'
import { chat } from '@tanstack/ai'

const adapter = anthropicText('claude-opus-4-6')

const judgeSchema = z.object({
  accuracy: z.number().min(1).max(10).describe('Accuracy rating from 1-10'),
  comprehensiveness: z
    .number()
    .min(1)
    .max(10)
    .describe('Comprehensiveness rating from 1-10'),
  summary: z.string().describe('Two sentence summary of the evaluation'),
})

const JUDGE_SYSTEM_PROMPT = `You are a strict evaluator comparing an AI-generated data analysis report against a gold-standard reference report.

You will receive:
1. The original user query
2. The gold-standard report (the ideal answer)
3. The candidate report to evaluate

Rate the candidate on two dimensions, each on a scale from 1 to 10 (10 = best):

- **Accuracy**: Are the numbers, rankings, and factual claims correct compared to the gold standard?
- **Comprehensiveness**: Does the candidate cover all the data points, breakdowns, and insights present in the gold standard?

Provide a two sentence summary of your evaluation.`

export const Route = createFileRoute('/_database-demo/api/judge' as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { query, goldReport, candidateReport } = await request.json()

          if (!query || !goldReport || !candidateReport) {
            return new Response(
              JSON.stringify({ error: 'Missing required fields' }),
              { status: 400, headers: { 'Content-Type': 'application/json' } },
            )
          }

          const result = await chat({
            adapter,
            messages: [
              {
                role: 'user' as const,
                content: `## Query\n${query}\n\n## Gold-Standard Report\n${goldReport}\n\n## Candidate Report\n${candidateReport}`,
              },
            ],
            systemPrompts: [JUDGE_SYSTEM_PROMPT],
            outputSchema: judgeSchema,
            maxTokens: 512,
          })

          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('[API Judge] Error:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Judging failed',
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})
