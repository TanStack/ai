import { BaseRealtimeAdapter } from '@tanstack/ai/adapters'
import { Modality } from '@google/genai'
import { createGeminiClient, getGeminiApiKeyFromEnv } from '../utils'
import type { GeminiClientConfig} from '../utils';
import type { GoogleGenAI} from '@google/genai';
import type { GEMINI_LIVE_MODELS, GeminiLiveAPIVoice } from '../model-meta'
import type { RealtimeOptions, RealtimeResult } from '@tanstack/ai/src'

/**
 * Provider-specific options for Gemini Live Api
 *
 * @experimental Gemini Live Api is an experimental feature.
 * @see https://ai.google.dev/gemini-api/docs/live
 */
export interface GeminiLiveAPIProviderOptions {
  /**
   * Voice configuration for Gemini Live API.
   * Choose from 6 available voices with different characteristics.
   */
  voiceConfig?: {
    prebuiltVoiceConfig?: {
      /**
       * The voice name to use for speech synthesis.
       * @see https://ai.google.dev/gemini-api/docs/speech-generation#voices
       */
      voiceName?: GeminiLiveAPIVoice
    }
  }
}

export interface GeminiLiveAPIConfig extends GeminiClientConfig {}

export type GeminiLiveAPIModel = (typeof GEMINI_LIVE_MODELS)[number]

export class GeminiLiveAPIAdapter<
  TModel extends GeminiLiveAPIModel
> extends BaseRealtimeAdapter<TModel, GeminiLiveAPIProviderOptions> {
  readonly name = 'gemini' as const

  private client: GoogleGenAI

  constructor(config: GeminiLiveAPIConfig, model: TModel) {
    super(config, model);

    this.client = createGeminiClient(config);
  }

  /**
   * Connects to Live API from Gemini Models functionalities.
   *
   * @experimental This implementation is experimental and may change.
   * @see https://ai.google.dev/gemini-api/docs/live
   */
  async connectRealtime(
    options: RealtimeOptions<GeminiLiveAPIProviderOptions>,
  ): Promise<RealtimeResult> {
    const { model, modelOptions } = options;

    const voiceConfig = modelOptions?.voiceConfig || {
      prebuiltVoiceConfig: {
        voiceName: 'Kore',
      },
    }

    const liveSession = await this.client.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig,
          ...(modelOptions?.languageCode && {
            languageCode: modelOptions.languageCode,
          }),
        },
      },
      ...(modelOptions?.systemInstruction && {
        systemInstruction: modelOptions.systemInstruction
      }),
      callbacks: {
        onopen: function() {
          console.debug('Opened');
        },
        onmessage: function(message) {
          console.debug(message);
        },
        onerror: function(e) {
          console.debug('Error:', e.message);
        },
        onclose: function(e) {
          console.debug('Close:', e.reason);
        }
      }
    });

    liveSession.close();

    return {};
  }
}

/**
 * Creates a Gemini Live API adapter with explicit API key.
 * Type resolution happens here at the call site.
 *
 * @experimental Gemini Live API is an experimental feature and may change.
 *
 * @param model - The model name (e.g., 'gemini-live-2.5-flash-native-audio')
 * @param apiKey - Your Google API key
 * @param config - Optional additional configuration
 * @returns Configured Gemini Live API adapter instance with resolved types
 *
 */
export function createGeminiLiveApi<TModel extends GeminiLiveAPIModel>(
  model: TModel,
  apiKey: string,
  config?: Omit<GeminiLiveAPIConfig, 'apiKey'>
): GeminiLiveAPIAdapter<TModel> {
  return new GeminiLiveAPIAdapter({ apiKey, ...config }, model);
}

/**
 * Creates a Gemini Live API adapter with automatic API key detection from environment variables.
 * Type resolution happens here at the call site.
 *
 * @experimental Gemini Live API is an experimental feature and may change.
 *
 * Looks for `GOOGLE_API_KEY` or `GEMINI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 *
 * @param model - The model name (e.g., 'gemini-live-2.5-flash-native-audio')
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured Gemini Live API adapter instance with resolved types
 * @throws Error if GOOGLE_API_KEY or GEMINI_API_KEY is not found in environment
 *
 */
export function geminiLiveAPI<TModel extends GeminiLiveAPIModel>(
  model: TModel,
  config?: Omit<GeminiLiveAPIConfig, 'apiKey'>
) {
  const apiKey = getGeminiApiKeyFromEnv();

  return createGeminiLiveApi(model, apiKey, config);
}
