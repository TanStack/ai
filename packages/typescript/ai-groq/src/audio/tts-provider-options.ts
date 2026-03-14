/**
 * Groq TTS voice options for English models
 */
export type GroqTTSEnglishVoice =
  | 'autumn'
  | 'diana'
  | 'hannah'
  | 'austin'
  | 'daniel'
  | 'troy'

/**
 * Groq TTS voice options for Arabic models
 */
export type GroqTTSArabicVoice = 'fahad' | 'sultan' | 'lulwa' | 'noura'

/**
 * Union of all Groq TTS voice options
 */
export type GroqTTSVoice = GroqTTSEnglishVoice | GroqTTSArabicVoice

/**
 * Groq TTS output format options.
 * Only wav is currently supported.
 */
export type GroqTTSFormat = 'flac' | 'mp3' | 'mulaw' | 'ogg' | 'wav'

/**
 * Groq TTS sample rate options
 */
export type GroqTTSSampleRate =
  | 8000
  | 16000
  | 22050
  | 24000
  | 32000
  | 44100
  | 48000

/**
 * Provider-specific options for Groq TTS.
 * These options are passed via `modelOptions` when calling `generateSpeech`.
 */
export interface GroqTTSProviderOptions {
  /**
   * The sample rate of the generated audio in Hz.
   */
  sample_rate?: GroqTTSSampleRate
}
