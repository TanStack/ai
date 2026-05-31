import type { ClientOptions } from 'openai'
import { resolveBedrockAuth } from './auth'
import { createSigV4Fetch } from './openai-sigv4-fetch'
import type { BedrockEndpoint } from './auth'

export type { BedrockEndpoint } from './auth'
export { resolveBedrockAuth } from './auth'
export type { ResolvedBedrockAuth } from './auth'

export interface BedrockClientConfig extends Omit<
  ClientOptions,
  'apiKey' | 'baseURL'
> {
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

/** Builds OpenAI ClientOptions for the requested endpoint. `forced` pins the endpoint (responses → 'mantle'). */
export function withBedrockDefaults(
  config: BedrockClientConfig,
  forced?: BedrockEndpoint,
): ClientOptions {
  const { region, endpoint, auth, apiKey, baseURL, fetch, ...rest } = config
  const resolvedRegion = region ?? DEFAULT_REGION
  const resolvedEndpoint = forced ?? endpoint ?? 'runtime'
  const resolved = resolveBedrockAuth(
    { apiKey, region: resolvedRegion, auth },
    resolvedEndpoint,
  )
  if (resolved.kind === 'bearer') {
    return {
      ...rest,
      baseURL: baseURL ?? buildBaseURL(resolvedRegion, resolvedEndpoint),
      apiKey: resolved.token,
      ...(fetch ? { fetch } : {}),
    }
  }
  return {
    ...rest,
    baseURL: baseURL ?? buildBaseURL(resolvedRegion, resolvedEndpoint),
    apiKey: SIGV4_PLACEHOLDER_KEY,
    fetch: fetch ?? createSigV4Fetch(resolved),
  }
}
