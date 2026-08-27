const ABORT_ERROR_NAMES = new Set([
  'AbortError',
  'APIUserAbortError',
  'RequestAbortedError',
])

export function isAbortShapedError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const name = (error as { name?: unknown }).name
    return typeof name === 'string' && ABORT_ERROR_NAMES.has(name)
  }
  return false
}

function normalizeCode(codeField: unknown): string | undefined {
  if (typeof codeField === 'string') return codeField
  if (typeof codeField === 'number' && Number.isFinite(codeField)) {
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
  if (typeof source.status === 'number' && Number.isFinite(source.status)) {
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
  if (typeof error === 'object' && error !== null) {
    const messageField = (error as { message?: unknown }).message
    return {
      message:
        typeof messageField === 'string' && messageField.length > 0
          ? messageField
          : fallbackMessage,
      code: extractCode(error as { code?: unknown; status?: unknown }),
    }
  }
  if (typeof error === 'string' && error.length > 0) {
    return { message: error, code: undefined }
  }
  return { message: fallbackMessage, code: undefined }
}

export function toRunErrorRawEvent(error: unknown): unknown {
  if (!error || typeof error !== 'object') return undefined
  const e = error as {
    rawEvent?: unknown
    error?: unknown
    metadata?: unknown
  }
  const hasRawEvent = e.rawEvent !== undefined && e.rawEvent !== null
  if (hasRawEvent) return e.rawEvent
  const hasNestedError =
    e.error !== undefined && e.error !== null && typeof e.error === 'object'
  if (hasNestedError) {
    return e.error
  }
  const hasMetadata = e.metadata !== undefined && e.metadata !== null
  if (hasMetadata) return e.metadata
  return undefined
}
