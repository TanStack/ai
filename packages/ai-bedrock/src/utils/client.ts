import { resolveBedrockAuth } from './auth'
import { createSigV4Fetch } from './openai-sigv4-fetch'
import type { ClientOptions } from 'openai'
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

/**
 * Per-model URL path on the `bedrock-mantle` endpoint (#925).
 *
 * AWS serves different model families on different mantle paths:
 *   - `google.gemma-*`     → `/openai/v1`   (OpenAI-compatible translation layer)
 *   - `deepseek.*`         → `/v1`          (default OpenAI-compatible path)
 *   - `openai.gpt-oss-*`   → `/v1`          (default)
 *   - `anthropic.claude-*` → `/anthropic/v1/messages` — *NOT* supported by the
 *     chat adapter: that path serves the Anthropic Messages API, which has a
 *     different wire format from OpenAI Chat Completions. Calling
 *     `bedrockText('anthropic.claude-…', { endpoint: 'mantle' })` will not work
 *     regardless of the path; use the Converse adapter or wait for a
 *     Messages-API adapter. The catalog already marks Claude models as
 *     `chat: false`, so this combination typechecks as an error today.
 *
 * Evidence: AWS model cards → "Programmatic Access" → "In-Region endpoint URL".
 *   - Gemma: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-google-gemma-4-31b.html
 *   - Claude Haiku 4.5: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html
 *   - DeepSeek: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-deepseek-deepseek-v3-2.html
 *
 * The runtime (`bedrock-runtime`) endpoint is unaffected — every chat-capable
 * model is served at `/openai/v1` there, so the model parameter is unused on
 * that branch.
 *
 * Forward-looking design (not implemented here, see issue #925 "Suggested
 * directions"): carry the path per (endpoint, api) on the generated catalog
 * entry so this becomes data-driven instead of a prefix switch. The prefix
 * match is the minimal fix for the reported bug; the catalog refactor is a
 * larger follow-up.
 */
function mantlePathForModel(model: string | undefined): string {
  if (model && model.startsWith('google.gemma-')) {
    return '/openai/v1'
  }
  return '/v1'
}

function buildBaseURL(
  region: string,
  endpoint: BedrockEndpoint,
  model?: string,
): string {
  return endpoint === 'mantle'
    ? `https://bedrock-mantle.${region}.api.aws${mantlePathForModel(model)}`
    : `https://bedrock-runtime.${region}.amazonaws.com/openai/v1`
}

/** Builds OpenAI ClientOptions for the requested endpoint. `forced` pins the endpoint (responses → 'mantle'). `model` is the Bedrock model id — only used to pick the correct path on the mantle endpoint (#925); pass it from the adapter constructor so the URL matches the model family. */
export function withBedrockDefaults(
  config: BedrockClientConfig,
  forced?: BedrockEndpoint,
  model?: string,
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
      baseURL: baseURL ?? buildBaseURL(resolvedRegion, resolvedEndpoint, model),
      apiKey: resolved.token,
      ...(fetch ? { fetch } : {}),
    }
  }
  return {
    ...rest,
    baseURL: baseURL ?? buildBaseURL(resolvedRegion, resolvedEndpoint, model),
    apiKey: SIGV4_PLACEHOLDER_KEY,
    fetch: fetch ?? createSigV4Fetch(resolved),
  }
}
