/**
 * Provider ids are open slugs, not a closed catalog. `@tanstack/ai` does not
 * list adapters. Any matching string is a valid id and becomes `x-byok-<id>`.
 */
export type ProviderId = string

/** `[a-z][a-z0-9-]{0,63}` — lowercase, no underscores, max 64 chars. */
export const BYOK_PROVIDER_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/

export const BYOK_HEADER_PREFIX = 'x-byok-'

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && BYOK_PROVIDER_ID_PATTERN.test(value)
}

export function byokHeaderName(provider: string): string {
  if (!isProviderId(provider)) {
    throw new Error(`Invalid BYOK provider id: ${provider}`)
  }
  return `${BYOK_HEADER_PREFIX}${provider}`
}
