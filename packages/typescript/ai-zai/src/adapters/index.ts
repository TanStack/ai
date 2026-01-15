import { getZAIApiKeyFromEnv } from '../utils/client'
import { ZAITextAdapter } from './text'
import type { ZAI_CHAT_MODELS } from '../model-meta'

export { ZAITextAdapter }
export {
  ZAISummarizeAdapter,
  createZAISummarize,
  zaiSummarize,
  type ZAISummarizeConfig,
  type ZAISummarizeProviderOptions,
} from './summarize'

export type ZAIModel = (typeof ZAI_CHAT_MODELS)[number]

export interface ZAIAdapterConfig {
  baseURL?: string
}

/**
 * Create a Z.AI text adapter instance with an explicit API key.
 */
export function createZAIChat(
  model: ZAIModel,
  apiKey: string,
  config?: ZAIAdapterConfig,
): ZAITextAdapter<ZAIModel> {
  if (!apiKey) {
    throw new Error('apiKey is required')
  }

  return new ZAITextAdapter(
    {
      apiKey,
      baseURL: config?.baseURL,
    },
    model,
  )
}

/**
 * Create a Z.AI text adapter instance using the ZAI_API_KEY environment variable.
 */
export function zaiText(
  model: ZAIModel,
  config?: ZAIAdapterConfig,
): ZAITextAdapter<ZAIModel> {
  const apiKey = getZAIApiKeyFromEnv()
  return new ZAITextAdapter(
    {
      apiKey,
      baseURL: config?.baseURL,
    },
    model,
  )
}

