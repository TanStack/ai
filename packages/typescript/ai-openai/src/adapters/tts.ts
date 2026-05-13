import { OpenAICompatibleTTSAdapter } from '@tanstack/ai-openai-compatible'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import {
  validateAudioInput,
  validateInstructions,
  validateSpeed,
} from '../audio/audio-provider-options'
import type { OpenAITTSModel } from '../model-meta'
import type { OpenAITTSProviderOptions } from '../audio/tts-provider-options'
import type { OpenAIClientConfig } from '../utils/client'

/**
 * Configuration for OpenAI TTS adapter
 */
export interface OpenAITTSConfig extends OpenAIClientConfig {}

/**
 * OpenAI Text-to-Speech Adapter
 *
 * Tree-shakeable adapter for OpenAI TTS functionality.
 * Supports tts-1, tts-1-hd, and gpt-4o-audio-preview models.
 *
 * Features:
 * - Multiple voice options: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse
 * - Multiple output formats: mp3, opus, aac, flac, wav, pcm
 * - Speed control (0.25 to 4.0)
 */
export class OpenAITTSAdapter<
  TModel extends OpenAITTSModel,
> extends OpenAICompatibleTTSAdapter<TModel, OpenAITTSProviderOptions> {
  readonly name = 'openai' as const

  constructor(config: OpenAITTSConfig, model: TModel) {
    super(config, model, 'openai')
  }

  protected override validateAudioInput(text: string): void {
    // Delegate to OpenAI-specific validation that also validates model/voice/format
    validateAudioInput({ input: text, model: this.model, voice: 'alloy' })
  }

  protected override validateSpeed(speed?: number): void {
    if (speed !== undefined) {
      validateSpeed({ speed, model: this.model, input: '', voice: 'alloy' })
    }
  }

  protected override validateInstructions(
    model: string,
    modelOptions?: OpenAITTSProviderOptions,
  ): void {
    if (modelOptions) {
      validateInstructions({
        ...modelOptions,
        model,
        input: '',
        voice: 'alloy',
      })
    }
  }
}

/**
 * Creates an OpenAI speech adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @param model - The model name (e.g., 'tts-1', 'tts-1-hd')
 * @param apiKey - Your OpenAI API key
 * @param config - Optional additional configuration
 * @returns Configured OpenAI speech adapter instance with resolved types
 *
 * @example
 * ```typescript
 * const adapter = createOpenaiSpeech('tts-1-hd', "sk-...");
 *
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Hello, world!',
 *   voice: 'nova'
 * });
 * ```
 */
export function createOpenaiSpeech<TModel extends OpenAITTSModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<OpenAITTSConfig, 'apiKey'>,
): OpenAITTSAdapter<TModel> {
  return new OpenAITTSAdapter({ apiKey, ...config }, model)
}

/**
 * Creates an OpenAI speech adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'tts-1', 'tts-1-hd')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI speech adapter instance with resolved types
 * @throws Error if OPENAI_API_KEY is not found in environment
 *
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const adapter = openaiSpeech('tts-1');
 *
 * const result = await generateSpeech({
 *   adapter,
 *   text: 'Welcome to TanStack AI!',
 *   voice: 'alloy',
 *   format: 'mp3'
 * });
 * ```
 */
export function openaiSpeech<TModel extends OpenAITTSModel>(
  model: TModel,
  config?: Omit<OpenAITTSConfig, 'apiKey'>,
): OpenAITTSAdapter<TModel> {
  const apiKey = getOpenAIApiKeyFromEnv()
  return createOpenaiSpeech(model, apiKey, config)
}
