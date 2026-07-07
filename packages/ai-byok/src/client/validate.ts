import { providerValidateConfig } from '../shared/providers'
import type { ProviderId } from '../shared/providers'

/**
 * Result of a key validation attempt.
 * - `valid` — provider accepted the key.
 * - `invalid` — provider rejected the key (401/403).
 * - `unsupported` — provider has no browser-reachable validation endpoint.
 */
export type ValidationStatus = 'valid' | 'invalid' | 'unsupported'

/**
 * Pings the provider's cheapest authenticated endpoint (usually a models list)
 * to confirm a key works before the user hits a wall mid-stream.
 *
 * Returns `'unsupported'` for providers with no browser-reachable endpoint.
 * For any other failure (rate limit, 5xx, or a network/CORS error) this
 * **throws** rather than guessing — the caller decides how to surface it. Note
 * that some providers block browser origins entirely; a thrown `TypeError`
 * ("Failed to fetch") is the honest signal there, not a silent `invalid`.
 */
export async function validateKey(
  provider: ProviderId,
  key: string,
): Promise<ValidationStatus> {
  const config = providerValidateConfig(provider)
  if (!config) return 'unsupported'

  const response = await fetch(config.url, {
    method: 'GET',
    headers: config.headers(key),
  })

  if (response.ok) return 'valid'
  if (response.status === 401 || response.status === 403) return 'invalid'

  throw new Error(
    `Could not validate ${provider} key: ${response.status} ${response.statusText}`,
  )
}
