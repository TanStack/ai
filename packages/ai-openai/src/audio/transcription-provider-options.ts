import type OpenAI from 'openai'
import type { TranscriptionResponseFormat } from '@tanstack/ai'

export type OpenAITranscriptionResponseFormat =
  | TranscriptionResponseFormat
  | 'diarized_json'

/**
 * Provider-specific options for OpenAI Transcription
 */
export interface OpenAITranscriptionProviderOptions {
  /**
   * The sampling temperature, between 0 and 1.
   * Higher values like 0.8 will make the output more random,
   * while lower values like 0.2 will make it more focused and deterministic.
   */
  temperature?: number
  /**
   * Additional information to include in the transcription response. logprobs will return the log probabilities
   * of the tokens in the response to understand the model's confidence in the transcription.
   * logprobs only works with response_format set to json and only with the models gpt-4o-transcribe,
   * gpt-4o-mini-transcribe, and gpt-4o-mini-transcribe-2025-12-15.
   * This field is not supported when using gpt-4o-transcribe-diarize.
   */
  // Strip the implicit `| undefined` introduced by indexing into the vendor's
  // optional field so this option type stays compatible under
  // exactOptionalPropertyTypes when spread back into the SDK params.
  include?: Exclude<
    OpenAI.Audio.TranscriptionCreateParams['include'],
    undefined
  >
  /**
   * The timestamp granularities to populate for this transcription.
   * response_format must be set to verbose_json to use timestamp granularities.
   * Either or both of these options are supported: word, or segment.
   */
  timestamp_granularities?: Array<'word' | 'segment'>
  /**
   * Raw OpenAI response_format option. Prefer the top-level responseFormat
   * argument for common transcription formats when using
   * generateTranscription(). Use `diarized_json` here for OpenAI diarization
   * output. Setting both this and the top-level responseFormat to different
   * values throws.
   */
  response_format?: OpenAITranscriptionResponseFormat
  /**
   * Raw OpenAI prompt option. Prefer the top-level prompt argument when using
   * generateTranscription().
   */
  prompt?: string
  /**
   * Optional list of speaker names that correspond to the audio samples provided in known_speaker_references[]. Each entry should be a short identifier (for example customer or agent). Up to 4 speakers are supported.
   * Must be provided together with known_speaker_references, with matching lengths.
   * Only supported with gpt-4o-transcribe-diarize.
   */
  known_speaker_names?: Array<string>
  /**
   * Optional list of audio samples (as data URLs) that contain known speaker references matching known_speaker_names[]. Each sample must be between 2 and 10 seconds, and can use any of the same input audio formats supported by file.
   * Must be provided together with known_speaker_names, with matching lengths.
   * Only supported with gpt-4o-transcribe-diarize.
   */
  known_speaker_references?: Array<string>
  /**
   * Controls how the audio is cut into chunks. If unset, the audio is
   * transcribed as a single block. Required by OpenAI when
   * `gpt-4o-transcribe-diarize` input is longer than 30 seconds (this adapter
   * defaults it to `"auto"` for that model). Use `"auto"` for the
   * service-managed VAD strategy, or pass a `server_vad` config to tune
   * segmentation.
   */
  chunking_strategy?:
    | 'auto'
    | OpenAI.Audio.TranscriptionCreateParams.VadConfig
    | null
}
