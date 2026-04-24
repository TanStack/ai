/**
 * Grok STT supported audio formats.
 * See https://docs.x.ai/developers/rest-api-reference/inference/voice
 */
export type GrokSTTAudioFormat =
  | 'pcm'
  | 'mulaw'
  | 'alaw'
  | 'wav'
  | 'mp3'
  | 'ogg'
  | 'opus'
  | 'flac'
  | 'aac'
  | 'mp4'
  | 'm4a'
  | 'mkv'

/**
 * Provider-specific options for Grok transcription (`POST /v1/stt`).
 */
export interface GrokTranscriptionProviderOptions {
  /**
   * The format of the provided audio. Required for raw codecs (pcm, mulaw, alaw).
   */
  audio_format?: GrokSTTAudioFormat
  /**
   * Sample rate of the audio (Hz). Required for raw codecs.
   */
  sample_rate?: number
  /**
   * Apply inverse text normalization. Requires `language` to be set on the
   * core `TranscriptionOptions`.
   */
  format?: boolean
  /**
   * Treat the audio as multichannel. When enabled, `channels` must also be set.
   */
  multichannel?: boolean
  /**
   * Channel count for multichannel raw audio (2–8).
   */
  channels?: number
  /**
   * Enable speaker diarization. When true, response words include a `speaker`
   * field.
   */
  diarize?: boolean
}
