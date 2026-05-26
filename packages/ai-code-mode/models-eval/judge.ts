import { z } from 'zod'
import { anthropicText } from '@tanstack/ai-anthropic'
import { chat } from '@tanstack/ai'

export const judgeSchema = z.object({
  accuracy: z.number().min(1).max(10).describe('Accuracy rating from 1-10'),
  comprehensiveness: z
    .number()
    .min(1)
    .max(10)
    .describe('How completely the response answers the user query (1-10)'),
  typescriptQuality: z
    .number()
    .min(1)
    .max(10)
    .describe('TypeScript quality rating from 1-10'),
  codeModeEfficiency: z
    .number()
    .min(1)
    .max(10)
    .describe('Code-mode efficiency rating from 1-10'),
  summary: z.string().describe('Two sentence summary of the evaluation'),
})

export type JudgeResult = z.infer<typeof judgeSchema>

const JUDGE_SYSTEM_PROMPT = `You are a strict evaluator comparing an AI-generated data analysis report against a gold-standard reference report.

You will receive:
1. The original user query
2. The gold-standard report (the ideal answer)
3. The candidate report to evaluate

Rate the candidate on four dimensions, each on a scale from 1 to 10 (10 = best):

- **Accuracy**: Are the numbers, rankings, and factual claims correct compared to the gold standard?
- **Comprehensiveness**: Does the candidate fully answer the user query and include all requested outputs? Use the query as the primary rubric. Use the gold report only as optional context, not as a strict checklist.
- **TypeScript Quality**: Is the generated TypeScript clear, type-safe, and idiomatic? Penalize brittle code, unnecessary \`any\`, and confusing structure.
- **Code-Mode Efficiency**: Did the model accomplish the task in a reasonable number of steps without unnecessary tool calls or retries?

Provide a two sentence summary of your evaluation.`

/**
 * Compare a candidate assistant report to the gold-standard report using Claude Opus (structured output).
 */
export async function judgeReports(params: {
  query: string
  goldReport: string
  candidateReport: string
  typescriptEvidence: string
}): Promise<JudgeResult> {
  const { query, goldReport, candidateReport, typescriptEvidence } = params

  const adapter = anthropicText('claude-opus-4-6')

  const result = await chat({
    adapter,
    messages: [
      {
        role: 'user' as const,
        content: `## Query\n${query}\n\n## Gold-Standard Report\n${goldReport}\n\n## Candidate Report\n${candidateReport}\n\n## TypeScript Evidence\n${typescriptEvidence}`,
      },
    ],
    systemPrompts: [JUDGE_SYSTEM_PROMPT],
    outputSchema: judgeSchema,
    maxTokens: 512,
  })

  return result as JudgeResult
}
