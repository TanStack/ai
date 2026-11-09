import { signSigV4 } from './sigv4'
import type { ResolvedBedrockAuth } from './auth'

type FetchLike = typeof fetch

/**
 * Wraps a fetch so each request is SigV4-signed with the resolved AWS
 * credentials (WebCrypto signer in `./sigv4`).
 */
export function createSigV4Fetch(
  auth: Extract<ResolvedBedrockAuth, { kind: 'sigv4' }>,
  baseFetch: FetchLike = fetch,
): FetchLike {
  return async (input, init) => {
    // Request.toString() returns '[object Request]', not the URL — use .url instead.
    const href =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : input.toString()
    const url = new URL(href)
    const headers = await signSigV4(
      {
        method: init?.method ?? 'GET',
        url,
        headers: init?.headers,
        body: init?.body,
      },
      await auth.credentials(),
      { service: auth.service, region: auth.region },
    )
    return baseFetch(url.toString(), { ...init, headers })
  }
}
