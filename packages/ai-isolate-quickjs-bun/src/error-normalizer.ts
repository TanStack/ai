import type { NormalizedError } from '@tanstack/ai-code-mode'

const MEMORY_LIMIT_ERROR = 'MemoryLimitError'
const STACK_OVERFLOW_ERROR = 'StackOverflowError'
const TIMEOUT_ERROR = 'TimeoutError'

/**
 * Whether this normalized error indicates the QuickJS VM should not be reused
 * (memory or stack limit exceeded).
 */
export function isFatalQuickJSLimitError(error: NormalizedError): boolean {
  return (
    error.name === MEMORY_LIMIT_ERROR || error.name === STACK_OVERFLOW_ERROR
  )
}

/**
 * Normalized error for code that exhausted the QuickJS heap so thoroughly
 * that QuickJS could not even allocate an Error object — it throws a bare
 * `null` exception value in that situation.
 */
export function memoryLimitError(stack?: string): NormalizedError {
  return {
    name: MEMORY_LIMIT_ERROR,
    message: 'Code execution exceeded memory limit',
    ...(stack !== undefined && { stack }),
  }
}

/**
 * Normalize various error types into a consistent format
 */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    const msg = error.message
    const lower = msg.toLowerCase()

    if (
      lower.includes('out of memory') ||
      lower.includes('memory alloc') ||
      (error.name === 'InternalError' && lower.includes('memory'))
    ) {
      return {
        name: MEMORY_LIMIT_ERROR,
        message: 'Code execution exceeded memory limit',
        stack: error.stack,
      }
    }

    if (lower.includes('stack overflow')) {
      return {
        name: STACK_OVERFLOW_ERROR,
        message: 'Code execution exceeded stack size limit',
        stack: error.stack,
      }
    }

    // quickjs-bun reports deadline expiry as a TimeoutError ("QuickJS
    // execution timed out"); a raw QuickJS interrupt surfaces as
    // `InternalError: interrupted`.
    if (
      error.name === TIMEOUT_ERROR ||
      (error.name === 'InternalError' && msg === 'interrupted')
    ) {
      return {
        name: TIMEOUT_ERROR,
        message:
          error.name === TIMEOUT_ERROR ? msg : 'Code execution timed out',
        stack: error.stack,
      }
    }

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: error,
    }
  }

  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>
    return {
      name: String(errObj.name || 'Error'),
      message: String(errObj.message || 'Unknown error'),
      ...(errObj['stack'] !== undefined && {
        stack: String(errObj['stack']),
      }),
    }
  }

  return {
    name: 'UnknownError',
    message: String(error),
  }
}
