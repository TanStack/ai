/**
 * @module @tanstack/ai-bedrock
 *
 * Amazon Bedrock adapter for TanStack AI via Bedrock's OpenAI-compatible APIs
 * and the native Converse API.  The public `bedrockText` / `createBedrockText`
 * factory branches between the Converse adapter (DEFAULT), the Chat Completions
 * adapter (`api: 'chat'`), and the Responses adapter (`api: 'responses'`).
 */
import { BedrockTextAdapter } from './adapters/text'
import { BedrockResponsesTextAdapter } from './adapters/responses-text'
import { BedrockConverseTextAdapter } from './adapters/converse-text'
import { BEDROCK_RESPONSES_MODELS } from './model-meta'
import type { BedrockTextConfig } from './adapters/text'
import type { BedrockResponsesConfig } from './adapters/responses-text'
import type { BedrockConverseConfig } from './adapters/converse-text'
import type { BedrockClientConfig } from './utils'
import type {
  BedrockChatModels,
  BedrockConverseModels,
  BedrockResponsesModels,
} from './model-meta'

/** Config for the branching factory's converse mode (default, or api: 'converse'). */
export type BedrockConverseApiConfig = BedrockConverseConfig & {
  api?: 'converse'
}
/** Config for the branching factory's chat mode (api: 'chat' required). */
export type BedrockChatApiConfig = BedrockTextConfig & {
  api: 'chat'
}
/** Config for the branching factory's responses mode (api: 'responses' required). */
export type BedrockResponsesApiConfig = BedrockResponsesConfig & {
  api: 'responses'
}

type AnyBedrockAdapter =
  | BedrockConverseTextAdapter<BedrockConverseModels>
  | BedrockTextAdapter<BedrockChatModels>
  | BedrockResponsesTextAdapter<BedrockResponsesModels>

/** Cast-free runtime guard: is this model in the Responses-capable subset? */
function isResponsesModel(model: string): model is BedrockResponsesModels {
  return BEDROCK_RESPONSES_MODELS.some((m) => m === model)
}

/** Strip the `api` discriminator from a config without an unused-var lint error. */
function stripApi<T extends { api?: unknown }>(config: T): Omit<T, 'api'> {
  const { api, ...rest } = config
  void api
  return rest
}

/**
 * Shared branching used by both public factories. Constructs the adapter
 * classes directly so their constructors run the full auth cascade lazily
 * (config.apiKey → BEDROCK_API_KEY → AWS_BEARER_TOKEN_BEDROCK → SigV4). No
 * eager env-key fetch here, so `auth: 'sigv4'` never throws for a missing key.
 *
 * Default path → Converse adapter; opt-in via `api: 'chat'` or `api: 'responses'`.
 */
function build(
  model: BedrockConverseModels,
  config?: BedrockClientConfig & { api?: 'converse' | 'chat' | 'responses' },
): AnyBedrockAdapter {
  if (config?.api === 'responses') {
    const rest = stripApi(config)
    if (!isResponsesModel(model)) {
      throw new Error(
        `Model "${model}" is not available on the Bedrock Responses API. ` +
          `Responses-capable models: ${BEDROCK_RESPONSES_MODELS.join(', ')}.`,
      )
    }
    return new BedrockResponsesTextAdapter(rest, model)
  }
  if (config?.api === 'chat') {
    return new BedrockTextAdapter(stripApi(config), model as BedrockChatModels)
  }
  // Default + explicit 'converse'
  return new BedrockConverseTextAdapter(config ? stripApi(config) : {}, model)
}

// --- createBedrockText: explicit key, overloaded on `api` ---
export function createBedrockText<TModel extends BedrockConverseModels>(
  model: TModel,
  apiKey: string,
  config?: BedrockConverseApiConfig,
): BedrockConverseTextAdapter<TModel>
export function createBedrockText<TModel extends BedrockChatModels>(
  model: TModel,
  apiKey: string,
  config: BedrockChatApiConfig,
): BedrockTextAdapter<TModel>
export function createBedrockText<TModel extends BedrockResponsesModels>(
  model: TModel,
  apiKey: string,
  config: BedrockResponsesApiConfig,
): BedrockResponsesTextAdapter<TModel>
export function createBedrockText(
  model: BedrockConverseModels,
  apiKey: string,
  config?:
    | BedrockConverseApiConfig
    | BedrockChatApiConfig
    | BedrockResponsesApiConfig,
): AnyBedrockAdapter {
  // Explicit apiKey is authoritative — spread config first so it can't override.
  return build(model, { ...config, apiKey })
}

// --- bedrockText: env-key counterpart, same overloads ---
export function bedrockText<TModel extends BedrockConverseModels>(
  model: TModel,
  config?: BedrockConverseApiConfig,
): BedrockConverseTextAdapter<TModel>
export function bedrockText<TModel extends BedrockChatModels>(
  model: TModel,
  config: BedrockChatApiConfig,
): BedrockTextAdapter<TModel>
export function bedrockText<TModel extends BedrockResponsesModels>(
  model: TModel,
  config: BedrockResponsesApiConfig,
): BedrockResponsesTextAdapter<TModel>
export function bedrockText(
  model: BedrockConverseModels,
  config?:
    | BedrockConverseApiConfig
    | BedrockChatApiConfig
    | BedrockResponsesApiConfig,
): AnyBedrockAdapter {
  // No eager env-key fetch: the adapter constructor resolves auth lazily so
  // SigV4 (and the env-key fallback) work without a forced API key here.
  return build(model, config)
}

// --- Re-exports ---
export {
  BedrockTextAdapter,
  createBedrockChat,
  type BedrockTextConfig,
  type BedrockTextProviderOptions,
} from './adapters/text'
export {
  BedrockResponsesTextAdapter,
  createBedrockResponsesText,
  type BedrockResponsesConfig,
  type BedrockResponsesProviderOptions,
} from './adapters/responses-text'
export {
  BedrockConverseTextAdapter,
  createBedrockConverse,
  type BedrockConverseConfig,
} from './adapters/converse-text'
export {
  resolveBedrockAuth,
  withBedrockDefaults,
  type BedrockClientConfig,
  type BedrockEndpoint,
  type ResolvedBedrockAuth,
} from './utils'
export {
  BEDROCK_CHAT_MODELS,
  BEDROCK_RESPONSES_MODELS,
  BEDROCK_CONVERSE_MODELS,
  type BedrockChatModels,
  type BedrockResponsesModels,
  type BedrockConverseModels,
  type BedrockChatModelProviderOptionsByName,
  type BedrockChatModelToolCapabilitiesByName,
  type BedrockModelInputModalitiesByName,
} from './model-meta'
export type {
  BedrockMessageMetadataByModality,
  BedrockTextMetadata,
  BedrockImageMetadata,
  BedrockAudioMetadata,
  BedrockVideoMetadata,
  BedrockDocumentMetadata,
} from './message-types'
