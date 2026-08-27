const ABORT_ERROR_NAMES = new Set([
  'AbortError',
  'APIUserAbortError',
  'RequestAbortedError',
])

export function isAbortShapedError(error: unknown): boolean {
  const isAbortShapedError2 = error && typeof error === 'object'
  if (isAbortShapedError2) {
    const name = (error as { name?: unknown }).name
    return typeof name === 'string' && ABORT_ERROR_NAMES.has(name)
  }
  return false
}

function normalizeCode(codeField: unknown): string | undefined {
  if (typeof codeField === 'string') return codeField
  const hasCodeField =
    typeof codeField === 'number' && Number.isFinite(codeField)
  if (hasCodeField) {
    return String(codeField)
  }
  return undefined
}

function extractCode(source: {
  code?: unknown
  status?: unknown
}): string | undefined {
  const fromCode = normalizeCode(source.code)
  if (fromCode !== undefined) return fromCode
  const isNumber =
    typeof source.status === 'number' && Number.isFinite(source.status)
  if (isNumber) {
    return String(source.status)
  }
  return undefined
}

export function toRunErrorPayload(
  error: unknown,
  fallbackMessage = 'Unknown error occurred',
): { message: string; code: string | undefined } {
  if (isAbortShapedError(error)) {
    return { message: 'Request aborted', code: 'aborted' }
  }
  if (error instanceof Error) {
    return {
      message: error.message || fallbackMessage,
      code: extractCode(error as Error & { code?: unknown; status?: unknown }),
    }
  }
  const isInvalid = typeof error === 'object' && error !== null
  if (isInvalid) {
    const messageField = (error as { message?: unknown }).message
    return {
      message:
        typeof messageField === 'string' && messageField.length > 0
          ? messageField
          : fallbackMessage,
      code: extractCode(error as { code?: unknown; status?: unknown }),
    }
  }
  const hasText = typeof error === 'string' && error.length > 0
  if (hasText) {
    return { message: error, code: undefined }
  }
  return { message: fallbackMessage, code: undefined }
}

export function toRunErrorRawEvent(error: unknown): unknown {
  const isInvalid = !error || typeof error !== 'object'
  if (isInvalid) return undefined
  const e = error as {
    rawEvent?: unknown
    error?: unknown
    metadata?: unknown
  }
  const isMissingE = e.rawEvent !== undefined && e.rawEvent !== null
  if (isMissingE) return e.rawEvent
  const isInvalidE =
    e.error !== undefined && e.error !== null && typeof e.error === 'object'
  if (isInvalidE) {
    return e.error
  }
  const isMissingE2 = e.metadata !== undefined && e.metadata !== null
  if (isMissingE2) return e.metadata
  return undefined
}
