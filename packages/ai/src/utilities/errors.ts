import type { StreamChunk } from '../types'

/**
 * Best-effort extraction of a human-readable message from an unknown thrown
 * value, returning `undefined` when none can be found.
 *
 * Used by `otelMiddleware` so error reporting stays identical across chat and
 * media spans.
 */
export function errorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  return undefined
}

/**
 * Best-effort extraction of an error's type name (used for the `error.type`
 * metric attribute), falling back to `'Error'` when no name is available.
 */
export function errorTypeName(err: unknown): string {
  if (err instanceof Error) return err.name || 'Error'
  if (err && typeof err === 'object' && 'name' in err) {
    const n = (err as { name?: unknown }).name
    if (typeof n === 'string') return n
  }
  return 'Error'
}

/**
 * Convert an AG-UI RUN_ERROR event to the Error shape exposed to consumers.
 * Preserves the provider code and sanitized raw event when available, while
 * accepting the deprecated nested error payload for backward compatibility.
 */
export function runErrorEventToError(
  chunk: Extract<StreamChunk, { type: 'RUN_ERROR' }>,
): Error {
  const error = new Error(
    chunk.message || chunk.error?.message || 'An error occurred',
  )
  const code = chunk.code ?? chunk.error?.code
  if (code !== undefined) {
    Object.assign(error, { code })
  }
  if (chunk.rawEvent !== undefined) {
    Object.assign(error, { rawEvent: chunk.rawEvent })
  }
  return error
}
