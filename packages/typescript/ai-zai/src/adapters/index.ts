import { ZAITextAdapter } from './text'
import type { ZAI_CHAT_MODELS } from '../model-meta'

export { ZAITextAdapter }

export type ZAIModel = (typeof ZAI_CHAT_MODELS)[number]

export interface ZAIAdapterConfig {
  baseURL?: string
}

function getZAIApiKeyFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined

  const key = env?.ZAI_API_KEY

  if (!key) {
    throw new Error(
      'ZAI_API_KEY is required. Please set it in your environment variables or use createZAIChat with an explicit API key.',
    )
  }

  return key
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

