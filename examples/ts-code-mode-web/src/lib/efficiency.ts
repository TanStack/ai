/**
 * Efficiency metrics calculation for Code Mode.
 *
 * Code Mode provides significant efficiency gains over traditional tool-calling patterns
 * by keeping data in the sandbox and only returning final results.
 */

// Model ID mapping from API format to pricing key
const MODEL_MAPPING: Record<string, string> = {
  'claude-haiku-4-5': 'claude-haiku-4.5',
  'claude-haiku-4-20250514': 'claude-haiku-4',
  'claude-haiku': 'claude-haiku',
  'gpt-4o': 'gpt-4o',
  'gemini-2.5-flash': 'gemini-2.5-flash',
}

export const EFFICIENCY_CONSTANTS = {
  // Conversion
  BYTES_PER_TOKEN: 4, // ~4 bytes per token (English text average)

  // Tool call patterns
  AVG_TOOL_RESULT_BYTES: 2400, // Average size of a tool result (~600 tokens)
  AVG_ASSISTANT_OVERHEAD: 600, // LLM response between tool calls (~150 tokens)
  BASE_CONTEXT_BYTES: 8000, // System prompt + user message (~2000 tokens)

  // Timing
  AVG_ROUND_TRIP_MS: 3000, // Average LLM round-trip time
  CODE_EXECUTION_OVERHEAD_MS: 500, // Sandbox startup + execution overhead

  // Pricing (per million tokens, as of 2025)
  PRICING: {
    'claude-haiku-4.5': { input: 3, output: 15 },
    'claude-haiku-4': { input: 3, output: 15 },
    'claude-haiku': { input: 0.25, output: 1.25 },
    'gpt-4o': { input: 2.5, output: 10 },
    'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  } as Record<string, { input: number; output: number }>,
}

export interface EfficiencyInput {
  actualBytes: number // Actual context used with Code Mode
  theoreticalBytes: number // Estimated context without Code Mode
  model?: string // Model ID for cost calculation
}

export interface EfficiencyMetrics {
  // Context (direct from input)
  contextActual: number
  contextTheoretical: number
  contextSavedBytes: number
  contextSavedPercent: number

  // Round-trips (estimated)
  roundTripsActual: number
  roundTripsTheoretical: number
  roundTripsSaved: number
  roundTripsSavedPercent: number

  // Time (estimated)
  timeActualMs: number
  timeTheoreticalMs: number
  timeSavedMs: number
  timeSavedPercent: number

  // Cost (estimated)
  costActual: number
  costTheoretical: number
  costSaved: number
  costSavedPercent: number
}

/**
 * Calculate compounded token usage for traditional tool-calling.
 * Each round resends all previous context — this is the key inefficiency.
 */
function calculateCompoundedTokens(
  toolCalls: number,
  C: typeof EFFICIENCY_CONSTANTS,
): number {
  const baseTokens = C.BASE_CONTEXT_BYTES / C.BYTES_PER_TOKEN
  const toolResultTokens = C.AVG_TOOL_RESULT_BYTES / C.BYTES_PER_TOKEN
  const overheadTokens = C.AVG_ASSISTANT_OVERHEAD / C.BYTES_PER_TOKEN

  let totalInputTokens = 0
  let accumulatedContext = baseTokens

  for (let i = 0; i < toolCalls; i++) {
    totalInputTokens += accumulatedContext
    accumulatedContext += toolResultTokens + overheadTokens
  }

  // Add final round for summary
  totalInputTokens += accumulatedContext

  // Output tokens: LLM responds each round
  const totalOutputTokens = toolCalls * overheadTokens

  return totalInputTokens + totalOutputTokens
}

/**
 * Calculate cost from tokens using model pricing.
 */
function calculateCost(
  tokens: number,
  pricing: { input: number; output: number },
): number {
  // Assume 80% input, 20% output
  const inputTokens = tokens * 0.8
  const outputTokens = tokens * 0.2

  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output

  return inputCost + outputCost
}

/**
 * Calculate comprehensive efficiency metrics from byte measurements.
 */
export function calculateEfficiency(input: EfficiencyInput): EfficiencyMetrics {
  const { actualBytes, theoreticalBytes, model } = input
  const C = EFFICIENCY_CONSTANTS

  // Map model ID to pricing key
  const pricingKey = model ? MODEL_MAPPING[model] || model : 'claude-haiku-4.5'

  // === Context (direct) ===
  const contextSavedBytes = theoreticalBytes - actualBytes
  const contextSavedPercent =
    theoreticalBytes > 0
      ? Math.round((contextSavedBytes / theoreticalBytes) * 100)
      : 0

  // === Round-trips (estimated from theoretical bytes) ===
  // theoreticalBytes ≈ base + n * (toolResult + overhead)
  // Solve for n (number of tool calls)
  const toolCallBytes = C.AVG_TOOL_RESULT_BYTES + C.AVG_ASSISTANT_OVERHEAD
  const estimatedToolCalls = Math.max(
    1,
    Math.round((theoreticalBytes - C.BASE_CONTEXT_BYTES) / toolCallBytes),
  )

  // Without Code Mode: each tool call = 1 round-trip
  // Plus ~30% overhead for LLM "thinking" between calls
  const roundTripsTheoretical = Math.ceil(estimatedToolCalls * 1.3)

  // With Code Mode: typically 2 round-trips
  // (1) User message → LLM writes code
  // (2) Code execution → LLM summarizes
  const roundTripsActual = 2

  const roundTripsSaved = roundTripsTheoretical - roundTripsActual
  const roundTripsSavedPercent =
    roundTripsTheoretical > 0
      ? Math.round((roundTripsSaved / roundTripsTheoretical) * 100)
      : 0

  // === Time (estimated from round-trips) ===
  const timeTheoreticalMs = roundTripsTheoretical * C.AVG_ROUND_TRIP_MS
  const timeActualMs =
    roundTripsActual * C.AVG_ROUND_TRIP_MS + C.CODE_EXECUTION_OVERHEAD_MS
  const timeSavedMs = timeTheoreticalMs - timeActualMs
  const timeSavedPercent =
    timeTheoreticalMs > 0
      ? Math.round((timeSavedMs / timeTheoreticalMs) * 100)
      : 0

  // === Cost (estimated from tokens) ===
  const pricing = C.PRICING[pricingKey] ?? C.PRICING['claude-haiku-4.5']

  // Convert bytes to tokens
  const actualTokens = actualBytes / C.BYTES_PER_TOKEN
  const theoreticalTokens = calculateCompoundedTokens(estimatedToolCalls, C)

  const costActual = calculateCost(actualTokens, pricing)
  const costTheoretical = calculateCost(theoreticalTokens, pricing)
  const costSaved = costTheoretical - costActual
  const costSavedPercent =
    costTheoretical > 0 ? Math.round((costSaved / costTheoretical) * 100) : 0

  return {
    contextActual: actualBytes,
    contextTheoretical: theoreticalBytes,
    contextSavedBytes,
    contextSavedPercent,

    roundTripsActual,
    roundTripsTheoretical,
    roundTripsSaved,
    roundTripsSavedPercent,

    timeActualMs,
    timeTheoreticalMs,
    timeSavedMs,
    timeSavedPercent,

    costActual,
    costTheoretical,
    costSaved,
    costSavedPercent,
  }
}

export function estimateRoundTripTimeMs(calls: number): number {
  const safeCalls = Math.max(0, calls)
  return safeCalls * EFFICIENCY_CONSTANTS.AVG_ROUND_TRIP_MS
}

export function estimateCostFromBytes(bytes: number, model?: string): number {
  const pricingKey = model ? MODEL_MAPPING[model] || model : 'claude-haiku-4.5'
  const pricing =
    EFFICIENCY_CONSTANTS.PRICING[pricingKey] ??
    EFFICIENCY_CONSTANTS.PRICING['claude-haiku-4.5']
  const tokens = bytes / EFFICIENCY_CONSTANTS.BYTES_PER_TOKEN
  return calculateCost(tokens, pricing)
}

// === Formatters ===

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.round(ms / 1000)}s`
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

export function formatCurrency(amount: number): string {
  if (amount < 0.01) return '<$0.01'
  return `$${amount.toFixed(2)}`
}
