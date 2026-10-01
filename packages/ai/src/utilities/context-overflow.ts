import type { TokenUsage } from '../types'

// The patterns and the silent and length-stop rules follow pi's
// `isContextOverflow` (`@earendil-works/pi-ai`, `dist/utils/overflow.js`, MIT).
const OVERFLOW_PATTERNS = [
  /prompt (?:is )?too long/i, // Anthropic, z.ai
  /request_too_large/i, // Anthropic request size (HTTP 413)
  /input is too long for requested model/i, // Amazon Bedrock
  /exceeds the context window/i, // OpenAI Chat Completions and Responses
  /exceeds (?:the )?(?:model'?s )?maximum context length(?: of [\d,]+ tokens?|\s*\([\d,]+\))/i, // OpenAI-compatible proxies (LiteLLM)
  /input token count.*exceeds the maximum/i, // Google Gemini
  /maximum prompt length is \d+/i, // xAI
  /reduce the length of the messages/i, // Groq
  /maximum context length is \d+ tokens/i, // OpenRouter
  /exceeds (?:the )?maximum allowed input length of [\d,]+ tokens?/i, // OpenRouter / Poolside
  /input \(\d+ tokens\) is longer than the model'?s context length \(\d+ tokens\)/i, // Together AI
  /exceeds the limit of \d+/i, // GitHub Copilot
  /exceeds the available context size/i, // llama.cpp
  /greater than the context length/i, // LM Studio
  /context window exceeds limit/i, // MiniMax
  /exceeded model token limit/i, // Kimi For Coding
  /too large for model with \d+ maximum context length/i, // Mistral
  /prompt has [\d,]+ tokens?, but the configured context size is [\d,]+ tokens?/i, // DS4
  /model_context_window_exceeded/i, // z.ai finish reason as error text
  /prompt too long; exceeded (?:max )?context length/i, // Ollama
  /range of input length should be/i, // DashScope / Qwen
  /context[_ ]length[_ ]exceeded/i, // generic
  /too many tokens/i, // generic
  /token limit exceeded/i, // generic
]

// Throttling and rate limits can match a pattern above ("too many tokens").
const NOT_OVERFLOW_PATTERNS = [
  /^(Throttling error|Service unavailable):/i, // Amazon Bedrock
  /rate limit/i,
  /too many requests/i,
]

// Cerebras answers an overflow with a bare 400 or 413.
const CEREBRAS_BODYLESS_ERROR = /^4(?:00|13)\s*(?:status code)?\s*\(no body\)/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** The message of a `RUN_ERROR` event, an `Error`, or a string. */
function errorText(error: unknown) {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (!isRecord(error)) return undefined
  if (typeof error.message === 'string' && error.message !== '') {
    return error.message
  }
  const nested = error.error
  return isRecord(nested) && typeof nested.message === 'string'
    ? nested.message
    : undefined
}

function isOverflowError(text: string, provider: string | undefined) {
  if (NOT_OVERFLOW_PATTERNS.some((pattern) => pattern.test(text))) return false
  if (OVERFLOW_PATTERNS.some((pattern) => pattern.test(text))) return true
  return provider === 'cerebras' && CEREBRAS_BODYLESS_ERROR.test(text)
}

/** What {@link isContextOverflow} reads. Every field is optional. */
export interface ContextOverflowInput {
  /** A `RUN_ERROR` event, an `Error`, or an error message. */
  error?: unknown
  /** The call's token usage, from `RUN_FINISHED`. */
  usage?: Pick<TokenUsage, 'promptTokens' | 'completionTokens'>
  /** The call's finish reason, from `RUN_FINISHED`. */
  finishReason?: string | null
  /** The model's context window in tokens. Needed for the silent and length-stop checks. */
  contextWindow?: number
  /** The provider id. Only `'cerebras'` changes the result: Cerebras answers an overflow with a 400 or 413 and no body. */
  provider?: string
}

/**
 * Whether a model call failed, or ended early, because the input did not fit
 * in the model's context window. Use it to compact the history and retry.
 *
 * - An error counts when its message matches a known overflow message of a
 *   provider (Anthropic, OpenAI, Gemini, Bedrock, xAI, Groq, OpenRouter,
 *   Mistral, Ollama, and more), and it is not a rate limit or a throttle.
 * - With `contextWindow`, a call that finished with `'stop'` counts when
 *   `usage.promptTokens` is more than the window. Some providers accept an
 *   overflow and cut the input without an error.
 * - With `contextWindow`, a call that finished with `'length'` counts when it
 *   wrote no tokens and its input fills 99% of the window.
 *
 * @example
 * ```ts
 * for await (const chunk of chat({ adapter, messages })) {
 *   if (chunk.type === 'RUN_ERROR' && isContextOverflow({ error: chunk })) {
 *     // compact `messages`, then call chat() again
 *   }
 * }
 * ```
 */
export function isContextOverflow(input: ContextOverflowInput) {
  const text = errorText(input.error)
  if (text !== undefined && isOverflowError(text, input.provider)) return true

  const { usage, finishReason, contextWindow } = input
  if (!usage || !contextWindow) return false
  if (finishReason === 'stop') return usage.promptTokens > contextWindow
  return (
    finishReason === 'length' &&
    usage.completionTokens === 0 &&
    usage.promptTokens >= contextWindow * 0.99
  )
}
