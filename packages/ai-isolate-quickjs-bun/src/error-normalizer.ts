import type { NormalizedError } from '@tanstack/ai-code-mode'

const MEMORY_LIMIT_ERROR = 'MemoryLimitError'
const STACK_OVERFLOW_ERROR = 'StackOverflowError'
const TIMEOUT_ERROR = 'TimeoutError'

export function isFatalQuickJSLimitError(error: NormalizedError): boolean {
  return (
    error.name === MEMORY_LIMIT_ERROR || error.name === STACK_OVERFLOW_ERROR
  )
}

export function memoryLimitError(stack?: string): NormalizedError {
  return {
    name: MEMORY_LIMIT_ERROR,
    message: 'Code execution exceeded memory limit',
    ...(stack !== undefined && { stack }),
  }
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    const msg = error.message
    const lower = msg.toLowerCase()

    const isMemoryLimit =
      lower.includes('out of memory') ||
      lower.includes('memory alloc') ||
      (error.name === 'InternalError' && lower.includes('memory'))
    if (isMemoryLimit) {
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

    const isTimeout =
      error.name === TIMEOUT_ERROR ||
      (error.name === 'InternalError' && msg === 'interrupted')
    if (isTimeout) {
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
