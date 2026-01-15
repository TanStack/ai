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

/**
 * Union type of all supported Z.AI model names.
 */
export type ZAIModel = (typeof ZAI_CHAT_MODELS)[number]

/**
 * Configuration options for the Z.AI adapter.
 */
export interface ZAIAdapterConfig {
  /**
   * Optional override for the Z.AI base URL.
   * Defaults to https://api.z.ai/api/paas/v4
   */
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

