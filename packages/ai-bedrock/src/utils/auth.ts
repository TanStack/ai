import type { AwsCredentialIdentityProvider } from '@smithy/types'
import type * as CredentialProviders from '@aws-sdk/credential-providers'

export type BedrockEndpoint = 'runtime' | 'mantle'

/** SigV4 service name differs per endpoint. */
export function sigv4Service(endpoint: BedrockEndpoint): string {
  return endpoint === 'mantle' ? 'bedrock-mantle' : 'bedrock'
}

export type ResolvedBedrockAuth =
  | { kind: 'bearer'; token: string }
  | {
      kind: 'sigv4'
      region: string
      service: string
      credentials: AwsCredentialIdentityProvider
    }

const DEFAULT_REGION = 'us-east-1'

function readApiKeyFromEnv(): string | undefined {
  // Bedrock is server-only (the AWS SDK is Node-only), so the key always comes
  // from process.env. Read it directly: a property access never throws, so —
  // unlike the previous try/catch around getApiKeyFromEnv — we no longer swallow
  // unrelated errors as "key not set". Empty/whitespace values are treated as
  // absent so a present-but-blank var falls through to the next auth source.
  const env = typeof process !== 'undefined' ? process.env : undefined
  const key = env?.BEDROCK_API_KEY ?? env?.AWS_BEARER_TOKEN_BEDROCK
  return key && key.trim() !== '' ? key : undefined
}

export interface BedrockAuthConfig {
  apiKey?: string
  region?: string
  auth?: 'apikey' | 'sigv4' | 'auto'
}

/** apiKey -> BEDROCK_API_KEY -> AWS_BEARER_TOKEN_BEDROCK -> SigV4 (credential chain). */
export function resolveBedrockAuth(
  config: BedrockAuthConfig,
  endpoint: BedrockEndpoint,
): ResolvedBedrockAuth {
  const mode = config.auth ?? 'auto'
  const region = config.region ?? DEFAULT_REGION

  if (mode !== 'sigv4') {
    const token = config.apiKey ?? readApiKeyFromEnv()
    if (token) return { kind: 'bearer', token }
    if (mode === 'apikey') {
      throw new Error(
        'No Bedrock API key found. Set BEDROCK_API_KEY (or ' +
          'AWS_BEARER_TOKEN_BEDROCK), pass `apiKey`, or use auth: "sigv4".',
      )
    }
  }

  return {
    kind: 'sigv4',
    region,
    service: sigv4Service(endpoint),
    // Lazy credential provider: the AWS SDK is Node/server-only, so we defer the
    // dynamic import until SigV4 actually needs to resolve credentials. The
    // specifier is held in a variable (not a string literal) so bundler dep
    // scanners (e.g. Vite/esbuild optimizeDeps) cannot statically discover the
    // AWS SDK and try to pre-bundle it for the browser — it would fail on the
    // SDK's Node-only `fromTokenFile` export chain. `typeof import(...)` is a
    // type-only reference (erased at emit) so we keep full typing.
    credentials: async (...args) => {
      const mod = '@aws-sdk/credential-providers'
      const { fromNodeProviderChain } = (await import(
        /* @vite-ignore */ mod
      )) as typeof CredentialProviders
      return fromNodeProviderChain()(...args)
    },
  }
}
