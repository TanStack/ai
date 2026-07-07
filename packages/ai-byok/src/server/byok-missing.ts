import type { ProviderId } from '../shared/providers'

/** Discriminated body returned by {@link byokMissing}. */
export interface ByokMissingBody {
  error: {
    type: 'byok_missing'
    provider: ProviderId
    message: string
  }
}

/**
 * Builds a typed JSON error response telling the client which provider key is
 * missing, so it can render an "add your `<provider>` key" prompt. Defaults to
 * HTTP 401. Carries no key material.
 */
export function byokMissing(
  provider: ProviderId,
  init?: ResponseInit,
): Response {
  const body: ByokMissingBody = {
    error: {
      type: 'byok_missing',
      provider,
      message: `Missing API key for "${provider}". Add your ${provider} key to continue.`,
    },
  }
  return new Response(JSON.stringify(body), {
    status: 401,
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  })
}

/** Type guard for a {@link ByokMissingBody} parsed from a response. */
export function isByokMissingBody(value: unknown): value is ByokMissingBody {
  if (typeof value !== 'object' || value === null) return false
  const { error } = value as { error?: unknown }
  if (typeof error !== 'object' || error === null) return false
  return (error as { type?: unknown }).type === 'byok_missing'
}
