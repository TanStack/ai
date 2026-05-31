import { SignatureV4 } from '@smithy/signature-v4'
import { Sha256 } from '@aws-crypto/sha256-js'
import type { HttpRequest } from '@smithy/types'
import type { ResolvedBedrockAuth } from './auth'

type FetchLike = typeof fetch

/**
 * Wraps a fetch so each request is SigV4-signed via the AWS signer that ships
 * with `@aws-sdk/client-bedrock-runtime`. Replaces the old aws-sigv4-fetch peer.
 */
export function createSigV4Fetch(
  auth: Extract<ResolvedBedrockAuth, { kind: 'sigv4' }>,
  baseFetch: FetchLike = fetch,
): FetchLike {
  const signer = new SignatureV4({
    service: auth.service,
    region: auth.region,
    credentials: auth.credentials,
    sha256: Sha256,
  })

  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.toString())
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v))
    headers['host'] = url.host

    const body =
      typeof init?.body === 'string' ? init.body : init?.body ?? undefined

    // Construct a plain object satisfying the @smithy/types HttpRequest interface —
    // no @smithy/protocol-http needed.
    const request: HttpRequest = {
      method: init?.method ?? 'GET',
      protocol: url.protocol,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers,
      body,
    }

    const signed = await signer.sign(request)
    return baseFetch(url.toString(), {
      ...init,
      headers: signed.headers as Record<string, string>,
    })
  }
}
