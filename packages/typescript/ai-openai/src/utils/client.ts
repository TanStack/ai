import OpenAI_SDK from 'openai'
import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { OpenAICompatibleClientConfig } from '@tanstack/openai-base'
import type { ClientOptions } from 'openai'

export interface OpenAIClientConfig extends ClientOptions {
  apiKey: string
}

/**
 * Creates an OpenAI SDK client instance
 */
export function createOpenAIClient(config: OpenAIClientConfig): OpenAI_SDK {
  return new OpenAI_SDK(config)
}

/**
 * Gets OpenAI API key from environment variables
 * @throws Error if OPENAI_API_KEY is not found
 */
export function getOpenAIApiKeyFromEnv(): string {
  return getApiKeyFromEnv('OPENAI_API_KEY')
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string): string {
  return _generateId(prefix)
}

/**
 * Converts an OpenAIClientConfig to OpenAICompatibleClientConfig.
 * This bridges the type gap between the local config type (which extends
 * the local copy of ClientOptions) and the base package's config type
 * (which extends its own copy of ClientOptions).
 */
export function toCompatibleConfig(
  config: OpenAIClientConfig,
): OpenAICompatibleClientConfig {
  return config as unknown as OpenAICompatibleClientConfig
}
