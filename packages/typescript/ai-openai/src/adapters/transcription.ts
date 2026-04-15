import { OpenAICompatibleTranscriptionAdapter } from '@tanstack/openai-base'
import { getOpenAIApiKeyFromEnv, toCompatibleConfig } from '../utils/client'
import type { OpenAITranscriptionModel } from '../model-meta'
import type { OpenAITranscriptionProviderOptions } from '../audio/transcription-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI Transcription adapter
 */
export interface OpenAITranscriptionConfig extends OpenAIClientConfig {}

/**
 * OpenAI Transcription (Speech-to-Text) Adapter
 *
 * Tree-shakeable adapter for OpenAI audio transcription functionality.
 * Supports whisper-1, gpt-4o-transcribe, gpt-4o-mini-transcribe, and gpt-4o-transcribe-diarize models.
 *
 * Features:
 * - Multiple transcription models with different capabilities
 * - Language detection or specification
 * - Multiple output formats: json, text, srt, verbose_json, vtt
 * - Word and segment-level timestamps (with verbose_json)
 * - Speaker diarization (with gpt-4o-transcribe-diarize)
 */
export class OpenAITranscriptionAdapter<
  TModel extends OpenAITranscriptionModel,
> extends OpenAICompatibleTranscriptionAdapter<
  TModel,
  OpenAITranscriptionProviderOptions
> {
  readonly name = 'openai' as const

  constructor(config: OpenAITranscriptionConfig, model: TModel) {
    super(toCompatibleConfig(config), model, 'openai')
  }

  protected override shouldDefaultToVerbose(model: string): boolean {
    return model !== 'whisper-1'
  }
}

/**
 * Creates an OpenAI transcription adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'whisper-1')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI transcription adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiTranscription('whisper-1', "sk-...");
 *
 * const result = await generateTranscription({
 *   adapter,
 *   audio: audioFile,
 *   language: 'en'
 * });
 * ```
 */
export function createOpenaiTranscription<
  TModel extends OpenAITranscriptionModel,
>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAITranscriptionConfig, 'apiKey'>,
): OpenAITranscriptionAdapter<TModel> {
  return new OpenAITranscriptionAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI transcription adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'whisper-1')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI transcription adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiTranscription('whisper-1');
 *
 * const result = await generateTranscription({
 *   adapter,
 *   audio: audioFile
 * });
 *
 * console.log(result.text)
 * ```
 */
export function openaiTranscription<TModel extends OpenAITranscriptionModel>(
  model: TModel,
  config?: Omit<OpenAITranscriptionConfig, 'apiKey'>,
): OpenAITranscriptionAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiTranscription(model, apiKey, config)
}
