/**
 * Ollama-specific provider usage details.
 * These fields are unique to Ollama and placed in providerUsageDetails.
 */
export interface OllamaProviderUsageDetails {
  /** Time spent loading the model in nanoseconds */
  loadDuration?: number
  /** Time spent evaluating the prompt in nanoseconds */
  promptEvalDuration?: number
  /** Time spent generating the response in nanoseconds */
  evalDuration?: number
  /** Total duration of the request in nanoseconds */
  totalDuration?: number
  /** Number of prompt evaluation steps */
  promptEvalCount?: number
  /** Number of evaluation steps for generation */
  evalCount?: number
  /** Index signature for Record<string, unknown> compatibility */
  [key: string]: unknown
}
