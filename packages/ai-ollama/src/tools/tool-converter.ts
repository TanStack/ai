import { convertFunctionToolToAdapterFormat } from './function-tool'
import type { Tool } from '@tanstack/ai'
import type { Tool as OllamaTool } from 'ollama'

/**
 * Converts standard Tools to Ollama-specific format.
 *
 * Ollama only supports function-style tools today, so every entry flows
 * through {@link convertFunctionToolToAdapterFormat}. Keeping this layered
 * structure matches peer adapters (openai/anthropic/grok/groq) so special
 * tool types can be added later without rewriting the adapter.
 */
export function convertToolsToProviderFormat(
  tools?: Array<Tool>,
): Array<OllamaTool> | undefined {
  if (!tools || tools.length === 0) {
    return undefined
  }
  return tools.map((tool) => convertFunctionToolToAdapterFormat(tool))
}
