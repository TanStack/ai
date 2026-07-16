import { isByokMissingBody } from '../shared/byok-missing'
import type { ByokMissingBody } from '../shared/byok-missing'
import type { ProviderId } from '../shared/providers'

export type { ByokMissingBody }
export { isByokMissingBody }

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