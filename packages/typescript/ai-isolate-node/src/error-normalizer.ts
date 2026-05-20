import type { NormalizedError } from '@tanstack/ai-code-mode'

/**
 * Normalize various error types into a consistent format
 */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code
    return {
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
      ...(code !== undefined ? { code } : {}),
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
      name: String(errObj['name'] || 'Error'),
      message: String(errObj['message'] || 'Unknown error'),
      ...(errObj['stack'] ? { stack: String(errObj['stack']) } : {}),
      ...(errObj['code'] ? { code: String(errObj['code']) } : {}),
    }
  }

  return {
    name: 'UnknownError',
    message: String(error),
  }
}
