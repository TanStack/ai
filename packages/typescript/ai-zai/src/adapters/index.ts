import { getZAIApiKeyFromEnv } from '../utils/client'
import { ZAITextAdapter } from './text'
import type { ZAI_CHAT_MODELS } from '../model-meta'

export { ZAITextAdapter, type ZAITextAdapterConfig } from './text'
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
  coding?: boolean
}

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
      coding: config?.coding,
    },
    model,
  )
}

export function zaiText(
  model: ZAIModel,
  config?: ZAIAdapterConfig,
): ZAITextAdapter<ZAIModel> {
  const apiKey = getZAIApiKeyFromEnv()
  return new ZAITextAdapter(
    {
      apiKey,
      baseURL: config?.baseURL,
      coding: config?.coding,
    },
    model,
  )
}
