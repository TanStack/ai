/**
 * Shared error-narrowing helper for activities that convert thrown values
 * into structured `RUN_ERROR` events.
 *
 * Accepts Error instances, objects with string-ish `message`/`code`, or bare
 * strings; always returns a shape safe to serialize. Never leaks the full
 * error object (which may carry request/response state from an SDK).
 */
export function toRunErrorPayload(
  error: unknown,
  fallbackMessage = 'Unknown error occurred',
): { message: string; code: string | undefined } {
  if (error instanceof Error) {
    const codeField = (error as Error & { code?: unknown }).code
    return {
      message: error.message || fallbackMessage,
      code: typeof codeField === 'string' ? codeField : undefined,
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
      code: typeof codeField === 'string' ? codeField : undefined,
    }
  }
  if (typeof error === 'string' && error.length > 0) {
    return { message: error, code: undefined }
  }
  return { message: fallbackMessage, code: undefined }
}
