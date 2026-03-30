import OpenAI from 'openai'
import type { OpenAICompatibleClientConfig } from '../types/config'

export function createOpenAICompatibleClient(
  config: OpenAICompatibleClientConfig,
): OpenAI {
  return new OpenAI(config)
}
