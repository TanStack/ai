/**
 * Grok TTS voice options.
 * See https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
 */
export type GrokTTSVoice = 'eve' | 'ara' | 'rex' | 'sal' | 'leo'

/**
 * Grok TTS output audio codecs.
 * Grok does NOT support opus or aac; those formats are mapped to mp3.
 */
export type GrokTTSCodec = 'mp3' | 'wav' | 'pcm' | 'mulaw' | 'alaw'

/**
 * Provider-specific options for Grok TTS (`POST /v1/tts`).
 */
export interface GrokTTSProviderOptions {
  /**
   * BCP-47 language code (e.g., `en`, `zh`, `pt-BR`) or `'auto'` for detection.
   * Defaults to `'en'` when not provided.
   */
  language?: string
  /**
   * Audio codec. Overrides the `format` field on `TTSOptions` when set.
   */
  codec?: GrokTTSCodec
  /**
   * Sample rate in Hz. Valid values: 8000, 16000, 22050, 24000, 44100, 48000.
   * Defaults to 24000.
   */
  sample_rate?: 8000 | 16000 | 22050 | 24000 | 44100 | 48000
  /**
   * Bit rate for MP3 output. Ignored for other codecs.
   * Valid values: 32000, 64000, 96000, 128000, 192000. Defaults to 128000.
   */
  bit_rate?: 32000 | 64000 | 96000 | 128000 | 192000
  /**
   * Set to 1 for lower latency streaming; 0 (default) for normal quality.
   */
  optimize_streaming_latency?: 0 | 1
  /**
   * Enable text normalization. Defaults to false.
   */
  text_normalization?: boolean
}
