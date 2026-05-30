import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export type BedrockEndpoint = 'runtime' | 'mantle'

export interface BedrockClientConfig
  extends Omit<ClientOptions, 'apiKey' | 'baseURL'> {
  /** Bedrock API key (bearer). Optional — falls back to env, then SigV4. */
  apiKey?: string
  /** Full AWS region (e.g. 'us-east-1'). Default 'us-east-1'. */
  region?: string
  /** Chat adapter only; the responses adapter forces 'mantle'. Default 'runtime'. */
  endpoint?: BedrockEndpoint
  /** Auth strategy. Default 'auto' (apiKey → env → SigV4). */
  auth?: 'apikey' | 'sigv4' | 'auto'
  /** Explicit override; wins over the computed endpoint URL (used by E2E → aimock). */
  baseURL?: string
}

const DEFAULT_REGION = 'us-east-1'
/** OpenAI SDK requires a non-empty apiKey even when a signed fetch overrides Authorization. */
const SIGV4_PLACEHOLDER_KEY = 'bedrock-sigv4'

function buildBaseURL(region: string, endpoint: BedrockEndpoint): string {
  return endpoint === 'mantle'
    ? `https://bedrock-mantle.${region}.api.aws/v1`
    : `https://bedrock-runtime.${region}.amazonaws.com/openai/v1`
}

/** Reads BEDROCK_API_KEY, then AWS_BEARER_TOKEN_BEDROCK. Returns undefined if neither is set. */
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

/** Throws if no Bedrock API key is available via config or env. */
export function getBedrockApiKeyFromEnv(): string {
  const key = readApiKeyFromEnv()
  if (!key) {
    throw new Error(
      'No Bedrock API key found. Set BEDROCK_API_KEY (or AWS_BEARER_TOKEN_BEDROCK) in your ' +
        'environment, pass `apiKey` to the factory, or use SigV4 auth (set auth: "sigv4" with ' +
        'AWS credentials configured).',
    )
  }
  return key
}

export interface ResolvedBedrockAuth {
  apiKey: string
  /** Present only for the SigV4 path — a signing fetch for the OpenAI SDK. */
  fetch?: ClientOptions['fetch']
}

/**
 * Resolves auth per the cascade: explicit apiKey → BEDROCK_API_KEY →
 * AWS_BEARER_TOKEN_BEDROCK → SigV4. `auth: 'apikey'` forces the bearer path
 * (throws with no key); `auth: 'sigv4'` forces signing.
 */
export function resolveBedrockAuth(
  config: BedrockClientConfig,
  endpoint: BedrockEndpoint,
): ResolvedBedrockAuth {
  const mode = config.auth ?? 'auto'

  if (mode !== 'sigv4') {
    const key = config.apiKey ?? readApiKeyFromEnv()
    if (key) return { apiKey: key }
    if (mode === 'apikey') {
      // No key and apikey mode forced — throw the canonical error (terminal).
      return { apiKey: getBedrockApiKeyFromEnv() }
    }
  }

  // SigV4 path — build a lazily-imported signing fetch.
  const region = config.region ?? DEFAULT_REGION
  return {
    apiKey: SIGV4_PLACEHOLDER_KEY,
    fetch: createLazySigV4Fetch(region, endpoint),
  }
}

/**
 * Returns a fetch that, on first call, dynamically imports the SigV4 signer
 * from the `./sigv4` subpath (which holds the optional `aws-sigv4-fetch` dep)
 * and delegates to it. Keeps the AWS signing code out of the default bundle.
 */
function createLazySigV4Fetch(
  region: string,
  endpoint: BedrockEndpoint,
): NonNullable<ClientOptions['fetch']> {
  let signed: NonNullable<ClientOptions['fetch']> | undefined
  return async (url, init) => {
    if (!signed) {
      const { bedrockSigV4Fetch } = await import('../sigv4/index')
      signed = bedrockSigV4Fetch({ region, endpoint })
    }
    return signed(url, init)
  }
}

/** Builds OpenAI ClientOptions for the requested endpoint. `forced` pins the endpoint (responses → 'mantle'). */
export function withBedrockDefaults(
  config: BedrockClientConfig,
  forced?: BedrockEndpoint,
): ClientOptions {
  const { region, endpoint, auth, apiKey, baseURL, fetch, ...rest } = config
  const resolvedRegion = region ?? DEFAULT_REGION
  const resolvedEndpoint = forced ?? endpoint ?? 'runtime'
  const resolvedAuth = resolveBedrockAuth(config, resolvedEndpoint)
  return {
    ...rest,
    baseURL: baseURL ?? buildBaseURL(resolvedRegion, resolvedEndpoint),
    apiKey: resolvedAuth.apiKey,
    // A user-supplied fetch wins over the SigV4 signer.
    ...(fetch
      ? { fetch }
      : resolvedAuth.fetch
        ? { fetch: resolvedAuth.fetch }
        : {}),
  }
}
