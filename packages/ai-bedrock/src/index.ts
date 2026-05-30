/**
 * @module @tanstack/ai-bedrock
 *
 * Amazon Bedrock adapter for TanStack AI via Bedrock's OpenAI-compatible APIs.
 * The public `bedrockText` / `createBedrockText` factory branches between the
 * Chat Completions adapter (default) and the Responses adapter via `api`.
 */
import { createBedrockChat } from './adapters/text'
import { createBedrockResponsesText } from './adapters/responses-text'
import { getBedrockApiKeyFromEnv } from './utils'
import { BEDROCK_RESPONSES_MODELS } from './model-meta'
import type { BedrockTextAdapter, BedrockTextConfig } from './adapters/text'
import type {
  BedrockResponsesConfig,
  BedrockResponsesTextAdapter,
} from './adapters/responses-text'
import type { BedrockChatModels, BedrockResponsesModels } from './model-meta'

/** Config for the branching factory's chat mode (api omitted or 'chat'). */
export type BedrockChatApiConfig = Omit<BedrockTextConfig, 'apiKey'> & {
  api?: 'chat'
}
/** Config for the branching factory's responses mode (api: 'responses' required). */
export type BedrockResponsesApiConfig = Omit<
  BedrockResponsesConfig,
  'apiKey'
> & { api: 'responses' }

type AnyBedrockAdapter =
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

/** Shared branching used by both public factories. */
function build(
  model: BedrockChatModels,
  apiKey: string,
  config?: BedrockChatApiConfig | BedrockResponsesApiConfig,
): AnyBedrockAdapter {
  if (config?.api === 'responses') {
    const rest = stripApi(config)
    if (!isResponsesModel(model)) {
      throw new Error(
        `Model "${model}" is not available on the Bedrock Responses API. ` +
          `Responses-capable models: ${BEDROCK_RESPONSES_MODELS.join(', ')}.`,
      )
    }
    return createBedrockResponsesText(model, apiKey, rest)
  }
  const rest = config ? stripApi(config) : undefined
  return createBedrockChat(model, apiKey, rest)
}

// --- createBedrockText: explicit key, overloaded on `api` ---
export function createBedrockText<TModel extends BedrockChatModels>(
  model: TModel,
  apiKey: string,
  config?: BedrockChatApiConfig,
): BedrockTextAdapter<TModel>
export function createBedrockText<TModel extends BedrockResponsesModels>(
  model: TModel,
  apiKey: string,
  config: BedrockResponsesApiConfig,
): BedrockResponsesTextAdapter<TModel>
export function createBedrockText(
  model: BedrockChatModels,
  apiKey: string,
  config?: BedrockChatApiConfig | BedrockResponsesApiConfig,
): AnyBedrockAdapter {
  return build(model, apiKey, config)
}

// --- bedrockText: env-key counterpart, same overloads ---
export function bedrockText<TModel extends BedrockChatModels>(
  model: TModel,
  config?: BedrockChatApiConfig,
): BedrockTextAdapter<TModel>
export function bedrockText<TModel extends BedrockResponsesModels>(
  model: TModel,
  config: BedrockResponsesApiConfig,
): BedrockResponsesTextAdapter<TModel>
export function bedrockText(
  model: BedrockChatModels,
  config?: BedrockChatApiConfig | BedrockResponsesApiConfig,
): AnyBedrockAdapter {
  return build(model, getBedrockApiKeyFromEnv(), config)
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
  getBedrockApiKeyFromEnv,
  resolveBedrockAuth,
  withBedrockDefaults,
  type BedrockClientConfig,
  type BedrockEndpoint,
} from './utils'
export {
  BEDROCK_CHAT_MODELS,
  BEDROCK_RESPONSES_MODELS,
  type BedrockChatModels,
  type BedrockResponsesModels,
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
