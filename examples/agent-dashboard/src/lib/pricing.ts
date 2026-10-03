const PRICES: Record<string, { input: number; output: number }> = {
  // Source: packages/ai-anthropic/src/model-meta.ts. USD per million tokens.
  'claude-haiku-4-5': { input: 1, output: 5 },
}

export const HARNESS_MODEL: Record<string, string> = {
  'sentiment/react': 'claude-haiku-4-5',
}

export function costUsd(
  harness: string | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICES[HARNESS_MODEL[harness ?? '']]
  if (!price) return 0
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000
}
