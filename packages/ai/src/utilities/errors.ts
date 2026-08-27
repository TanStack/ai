import type { StreamChunk } from '../types'

/**
 * Thrown when a skills request exceeds a provider limit. Lives in core (rather
 * than `@tanstack/ai-skills`) so the native tool factories in `ai-anthropic`
 * and `openai-base` can throw it without depending on the skills package;
 * `@tanstack/ai-skills` re-exports it for the portable path.
 *
 * `path` distinguishes the native provider cap (e.g. Anthropic's 8-skill
 * limit) from a portable-path limit, so a portable user isn't sent chasing a
 * cap that only applies to hosted skills.
 */
export interface SkillLimitErrorInit {
  provider: 'anthropic' | 'openai' | 'gemini' | 'other'
  path: 'native' | 'portable'
  limit: string
  allowed: number
  actual: number
  offending: Array<string>
}

export class SkillLimitError extends Error {
  readonly provider: 'anthropic' | 'openai' | 'gemini' | 'other'
  readonly path: 'native' | 'portable'
  readonly limit: string
  readonly allowed: number
  readonly actual: number
  readonly offending: Array<string>

  constructor(init: SkillLimitErrorInit) {
    super(
      `${init.provider} ${init.path} skills limit exceeded (${init.limit}): ` +
        `${init.actual} > ${init.allowed}`,
    )
    this.name = 'SkillLimitError'
    this.provider = init.provider
    this.path = init.path
    this.limit = init.limit
    this.allowed = init.allowed
    this.actual = init.actual
    this.offending = init.offending
  }
}

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
