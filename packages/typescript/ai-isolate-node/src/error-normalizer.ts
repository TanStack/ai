import type { NormalizedError } from '@tanstack/ai-code-mode'

/**
 * Normalize various error types into a consistent format
 */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as NodeJS.ErrnoException).code,
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
      stack: errObj.stack ? String(errObj.stack) : undefined,
      code: errObj.code ? String(errObj.code) : undefined,
    }
  }

  return {
    name: 'UnknownError',
    message: String(error),
  }
}
