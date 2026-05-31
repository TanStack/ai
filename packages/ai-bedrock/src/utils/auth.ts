import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import { fromNodeProviderChain } from '@aws-sdk/credential-providers'

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
      credentials: ReturnType<typeof fromNodeProviderChain>
    }

const DEFAULT_REGION = 'us-east-1'

function readApiKeyFromEnv(): string | undefined {
  try {
    return getApiKeyFromEnv('BEDROCK_API_KEY')
  } catch {
    try {
      return getApiKeyFromEnv('AWS_BEARER_TOKEN_BEDROCK')
    } catch {
      return undefined
    }
  }
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
    credentials: fromNodeProviderChain(),
  }
}
