import type { ClientOptions } from 'openai'
import type { BedrockEndpoint } from '../utils/client'

export interface BedrockSigV4Options {
  region: string
  endpoint: BedrockEndpoint
  /** Override the SigV4 service name (default 'bedrock'). */
  service?: string
}

interface SigV4Params {
  service: string
  region: string
}

// Mirrors the createSignedFetcher signature from `aws-sigv4-fetch` (see
// aws-sigv4-fetch.d.ts). Defined here so we can type the variable without
// using `import()` in a type annotation (forbidden by consistent-type-imports).
type SignedFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

type CreateSignedFetcher = (opts: {
  service: string
  region: string
}) => SignedFetcher

/** Pure resolver — testable without network or credentials. */
export function resolveSigV4Params(options: BedrockSigV4Options): SigV4Params {
  const defaultService =
    options.endpoint === 'mantle' ? 'bedrock-mantle' : 'bedrock'
  return { service: options.service ?? defaultService, region: options.region }
}

/**
 * Builds a fetch that signs each request with AWS SigV4, suitable for the
 * OpenAI SDK `fetch` option against Bedrock's OpenAI-compatible endpoints.
 *
 * Requires the optional `aws-sigv4-fetch` dependency (install it yourself:
 * `pnpm add aws-sigv4-fetch`). AWS credentials are resolved from the standard
 * provider chain. Throws an actionable error if the dep is absent.
 */
export function bedrockSigV4Fetch(
  options: BedrockSigV4Options,
): NonNullable<ClientOptions['fetch']> {
  const { service, region } = resolveSigV4Params(options)
  let signedFetch: SignedFetcher | undefined

  const fn: NonNullable<ClientOptions['fetch']> = async (url, init) => {
    if (!signedFetch) {
      let createSignedFetcher: CreateSignedFetcher
      try {
        const mod = await import('aws-sigv4-fetch')
        createSignedFetcher = mod.createSignedFetcher
      } catch {
        throw new Error(
          'SigV4 auth for @tanstack/ai-bedrock requires the optional "aws-sigv4-fetch" ' +
            'package. Install it (`pnpm add aws-sigv4-fetch`) or use API-key auth via BEDROCK_API_KEY.',
        )
      }
      signedFetch = createSignedFetcher({ service, region })
    }
    const fetcher = signedFetch
    return fetcher(url, init)
  }
  return fn
}
