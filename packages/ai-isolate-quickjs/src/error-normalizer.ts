import type { NormalizedError } from '@tanstack/ai-code-mode'

const MEMORY_LIMIT_ERROR = 'MemoryLimitError'
const STACK_OVERFLOW_ERROR = 'StackOverflowError'
export const TIMEOUT_ERROR = 'TimeoutError'

/**
 * Whether this normalized error indicates the QuickJS VM should not be reused
 * (memory or stack limit exceeded). Timeouts are also terminal but take a
 * separate release path (see `releaseAfterTimeout` in isolate-context).
 */
export function isFatalQuickJSLimitError(error: NormalizedError): boolean {
  return (
    error.name === MEMORY_LIMIT_ERROR || error.name === STACK_OVERFLOW_ERROR
  )
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

    // QuickJS reports a fired interrupt handler as "InternalError: interrupted".
    if (lower.includes('interrupted')) {
      return {
        name: TIMEOUT_ERROR,
        message: 'Code execution timed out',
        stack: error.stack,
      }
    }

    if (error.name === 'RuntimeError' && lower.includes('unreachable')) {
      return {
        name: 'WasmRuntimeError',
        message: msg || 'WebAssembly runtime error',
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
