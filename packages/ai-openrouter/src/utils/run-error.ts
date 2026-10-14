import { CONTEXT_OVERFLOW_CODE } from '@tanstack/ai'
import { toRunErrorPayload } from '@tanstack/ai/adapter-internals'
import { OpenRouterError } from '@openrouter/sdk/models/errors'

/**
 * `toRunErrorPayload`, with `code` set to `CONTEXT_OVERFLOW_CODE` for a
 * context overflow. OpenRouter has no error code for it. It answers 400 with
 * this text for every upstream provider, so the text is the only signal.
 */
export function toOpenRouterRunErrorPayload(
  error: unknown,
  fallbackMessage: string,
): { message: string; code: string | undefined } {
  const payload = toRunErrorPayload(error, fallbackMessage)
  return error instanceof OpenRouterError &&
    error.statusCode === 400 &&
    payload.message.includes('maximum context length')
    ? { ...payload, code: CONTEXT_OVERFLOW_CODE }
    : payload
}
