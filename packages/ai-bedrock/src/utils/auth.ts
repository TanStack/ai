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
  // unrelated errors as "key not set". Each var is blank-checked independently
  // so a present-but-blank BEDROCK_API_KEY falls through to
  // AWS_BEARER_TOKEN_BEDROCK (and only then to SigV4) rather than masking it.
  const env = typeof process !== 'undefined' ? process.env : undefined
  for (const value of [env?.BEDROCK_API_KEY, env?.AWS_BEARER_TOKEN_BEDROCK]) {
    if (value && value.trim() !== '') return value
  }
  return undefined
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
    // Lazy credential provider: the AWS SDK is Node/server-only, so we defer
    // the dynamic import until SigV4 actually needs to resolve credentials.
    // A string-literal specifier (rather than a variable) lets static bundlers
    // — esbuild, bun build, Rollup — resolve and include the SDK in
    // self-contained server bundles (#929). The SDK still stays out of the
    // module-load graph until first use because the import is dynamic.
    //
    // Vite's dev-time optimizeDeps pre-bundler may try to scan this import
    // for the browser and fail on the SDK's Node-only `fromTokenFile` export
    // chain. Browser-side use of this server-only adapter is unsupported; if
    // Vite flags the SDK during a server build, add `@aws-sdk/credential-providers`
    // (and `@aws-sdk/client-bedrock-runtime`) to `optimizeDeps.exclude` — see
    // `docs/adapters/bedrock.md` and the matching pattern in
    // `examples/ts-react-chat/vite.config.ts`.
    credentials: async (...args) => {
      const { fromNodeProviderChain } = (await import(
        '@aws-sdk/credential-providers'
      )) as typeof CredentialProviders
      return fromNodeProviderChain()(...args)
    },
  }
}
