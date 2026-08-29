import { ChatStreamSummarizeAdapter } from '@tanstack/ai/adapters'
import { getOrcaRouterApiKeyFromEnv } from '../utils/client'
import { OrcaRouterTextAdapter } from './text'
import type { InferTextProviderOptions } from '@tanstack/ai/adapters'
import type { OrcaRouterModelId } from '../model-meta'
import type { OrcaRouterClientConfig } from '../utils/client'

/**
 * Configuration for the OrcaRouter summarize adapter
 */
export interface OrcaRouterSummarizeConfig extends OrcaRouterClientConfig {}

/** Model type for OrcaRouter summarization */
export type OrcaRouterSummarizeModel = OrcaRouterModelId

/**
 * Creates an OrcaRouter summarize adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model id (e.g., 'openai/gpt-5.5')
 * @param apiKey - Your OrcaRouter API key
 * @param config - Optional additional configuration
 * @returns Configured OrcaRouter summarize adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOrcaRouterSummarize('openai/gpt-5.5', "sk-orca-...");
 * ```
 */
export function createOrcaRouterSummarize<
  TModel extends OrcaRouterSummarizeModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<OrcaRouterSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<OrcaRouterTextAdapter<TModel>>
> {
  return new ChatStreamSummarizeAdapter(
    new OrcaRouterTextAdapter({ apiKey, ...config }, model),
    model,
    'orcarouter',
  )
}

/**
 * Creates an OrcaRouter summarize adapter with automatic API key detection
 * from environment variables. Type resolution happens here at the call site.
 *
 * Looks for `ORCAROUTER_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model id (e.g., 'openai/gpt-5.5')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OrcaRouter summarize adapter instance with resolved types
 * @throws Error if ORCAROUTER_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses ORCAROUTER_API_KEY from environment
 * const adapter = orcaRouterSummarize('openai/gpt-5.5');
 *
 * await summarize({
 *   adapter,
 *   text: "Long article text..."
 * });
 * ```
 */
export function orcaRouterSummarize<TModel extends OrcaRouterSummarizeModel>(
  model: TModel,
  config?: Omit<OrcaRouterSummarizeConfig, 'apiKey'>,
): ChatStreamSummarizeAdapter<
  TModel,
  InferTextProviderOptions<OrcaRouterTextAdapter<TModel>>
> {
  return createOrcaRouterSummarize(
    model,
    getOrcaRouterApiKeyFromEnv(),
    config,
  )
}
