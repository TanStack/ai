/**
 * OpenAI TTS voice options
 */
export type OpenAITTSVoice =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'fable'
  | 'onyx'
  | 'nova'
  | 'sage'
  | 'shimmer'
  | 'verse'

/**
 * OpenAI TTS output format options
 */
export type OpenAITTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'

/**
 * Provider-specific options for OpenAI TTS
 */
export interface OpenAITTSProviderOptions {
  /**
   * Control the voice of your generated audio with additional instructions.
   * Does not work with tts-1 or tts-1-hd.
   */
  instructions?: string

}
