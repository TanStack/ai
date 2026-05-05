import type { UIMessage } from '@tanstack/ai'

export interface TypeScriptAttempt {
  toolCallId: string
  typescriptCode: string
  success?: boolean
  errorName?: string
  errorMessage?: string
}

export interface ComputedMetrics {
  totalToolCalls: number
  totalExecuteCalls: number
  successfulExecuteCalls: number
  compilationFailures: number
  runtimeFailures: number
  redundantSchemaChecks: number
  typeScriptAttempts: Array<TypeScriptAttempt>
}

export interface StarInputs {
  accuracy: number
  comprehensiveness: number
  typescriptQuality: number
  codeModeEfficiency: number
  speedTier: number
  tokenEfficiencyTier: number
  stabilityTier: number
  compilationFailures: number
  runtimeFailures: number
  totalExecuteCalls: number
}

export interface StarRating {
  stars: 1 | 2 | 3
  weightedScore: number
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

export function computeMetrics(messages: Array<UIMessage>): ComputedMetrics {
  const toolCallLookup = new Map<string, { name: string; arguments: string }>()
  const toolResultLookup = new Map<
    string,
    { content: string; state?: string; error?: string }
  >()

  let totalToolCalls = 0
  let totalExecuteCalls = 0
  let redundantSchemaChecks = 0
  let hasSeenSchemaCheck = false

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'tool-call') {
        totalToolCalls += 1
        toolCallLookup.set(part.id, {
          name: part.name,
          arguments: part.arguments,
        })

        if (part.name === 'getSchemaInfo') {
          if (hasSeenSchemaCheck) redundantSchemaChecks += 1
          hasSeenSchemaCheck = true
        }
        if (part.name === 'execute_typescript') {
          totalExecuteCalls += 1
        }
      }

      if (part.type === 'tool-result') {
        toolResultLookup.set(part.toolCallId, {
          content: part.content,
          state: part.state,
          error: part.error,
        })
      }
    }
  }

  const typeScriptAttempts: Array<TypeScriptAttempt> = []
  let compilationFailures = 0
  let runtimeFailures = 0

  for (const [toolCallId, call] of toolCallLookup.entries()) {
    if (call.name !== 'execute_typescript') continue

    const args = safeJsonParse(call.arguments) as
      | { typescriptCode?: string }
      | undefined
    const result = toolResultLookup.get(toolCallId)
    const parsedResult = result?.content
      ? (safeJsonParse(result.content) as
          | {
              success?: boolean
              error?: { name?: string; message?: string }
            }
          | undefined)
      : undefined

    const success = parsedResult?.success
    const errorName = parsedResult?.error?.name
    const errorMessage = parsedResult?.error?.message || result?.error
    if (success === false) {
      if (errorName === 'TypeScriptError') compilationFailures += 1
      else runtimeFailures += 1
    }

    typeScriptAttempts.push({
      toolCallId,
      typescriptCode: args?.typescriptCode || '',
      success,
      errorName,
      errorMessage,
    })
  }

  return {
    totalToolCalls,
    totalExecuteCalls,
    successfulExecuteCalls: typeScriptAttempts.filter((a) => a.success).length,
    compilationFailures,
    runtimeFailures,
    redundantSchemaChecks,
    typeScriptAttempts,
  }
}

export function formatTypescriptEvidence(
  attempts: Array<TypeScriptAttempt>,
): string {
  if (attempts.length === 0) {
    return 'No execute_typescript calls were made.'
  }

  return attempts
    .map((attempt, idx) => {
      const code = attempt.typescriptCode || '<missing typescriptCode>'
      const status =
        attempt.success === true
          ? 'success'
          : attempt.success === false
            ? `failed (${attempt.errorName || 'Error'}: ${attempt.errorMessage || 'unknown'})`
            : 'unknown'
      return [
        `### Attempt ${idx + 1} (${attempt.toolCallId})`,
        `status: ${status}`,
        '```typescript',
        code,
        '```',
      ].join('\n')
    })
    .join('\n\n')
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function normalizeTenPoint(value: number): number {
  return clamp01((value - 1) / 9)
}

function normalizeFivePoint(value: number): number {
  return clamp01((value - 1) / 4)
}

function failurePenalty(inputs: StarInputs): number {
  if (inputs.totalExecuteCalls <= 0) return 0.4
  const failureRate =
    (inputs.compilationFailures + inputs.runtimeFailures) /
    inputs.totalExecuteCalls
  return clamp01(1 - failureRate)
}

export function computeStarRating(inputs: StarInputs): StarRating {
  const codeModeBlended =
    normalizeTenPoint(inputs.codeModeEfficiency) * 0.7 +
    failurePenalty(inputs) * 0.3

  const weightedScore =
    normalizeTenPoint(inputs.accuracy) * 0.25 +
    normalizeTenPoint(inputs.comprehensiveness) * 0.15 +
    normalizeTenPoint(inputs.typescriptQuality) * 0.15 +
    codeModeBlended * 0.1 +
    normalizeFivePoint(inputs.speedTier) * 0.1 +
    normalizeFivePoint(inputs.tokenEfficiencyTier) * 0.1 +
    normalizeFivePoint(inputs.stabilityTier) * 0.15

  const stars: 1 | 2 | 3 =
    weightedScore >= 0.75 ? 3 : weightedScore >= 0.45 ? 2 : 1

  return {
    stars,
    weightedScore: Number(weightedScore.toFixed(4)),
  }
}
