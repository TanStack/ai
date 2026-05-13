/**
 * Shared error-narrowing helper for activities that convert thrown values
 * into structured `RUN_ERROR` events.
 *
 * Accepts Error instances, objects with string-ish `message`/`code`, or bare
 * strings; always returns a shape safe to serialize. Never leaks the full
 * error object (which may carry request/response state from an SDK).
 *
 * Abort-shaped errors (DOM `AbortError`, OpenAI `APIUserAbortError`,
 * OpenRouter `RequestAbortedError`) are normalized to a stable
 * `{ message: 'Request aborted', code: 'aborted' }` shape so callers can
 * discriminate user-initiated cancellation from other failures without
 * matching on provider-specific message strings.
 */
const ABORT_ERROR_NAMES = new Set([
  'AbortError',
  'APIUserAbortError',
  'RequestAbortedError',
])

// HTTP status codes carried as numbers (e.g. `error.status = 429`) are a
// common variant on SDK error classes; coerce so the resulting `code` field
// is stable as a string for downstream consumers.
function normalizeCode(codeField: unknown): string | undefined {
  if (typeof codeField === 'string') return codeField
  if (typeof codeField === 'number' && Number.isFinite(codeField)) {
    return String(codeField)
  }
  return undefined
}

export function toRunErrorPayload(
  error: unknown,
  fallbackMessage = 'Unknown error occurred',
): { message: string; code: string | undefined } {
  if (error && typeof error === 'object') {
    const name = (error as { name?: unknown }).name
    if (typeof name === 'string' && ABORT_ERROR_NAMES.has(name)) {
      return { message: 'Request aborted', code: 'aborted' }
    }
  }
  if (error instanceof Error) {
    const codeField = (error as Error & { code?: unknown }).code
    return {
      message: error.message || fallbackMessage,
      code: normalizeCode(codeField),
    }
  }
  if (typeof error === 'object' && error !== null) {
    const messageField = (error as { message?: unknown }).message
    const codeField = (error as { code?: unknown }).code
    return {
      message:
        typeof messageField === 'string' && messageField.length > 0
          ? messageField
          : fallbackMessage,
      code: normalizeCode(codeField),
    }
  }
  if (typeof error === 'string' && error.length > 0) {
    return { message: error, code: undefined }
  }
  return { message: fallbackMessage, code: undefined }
}
