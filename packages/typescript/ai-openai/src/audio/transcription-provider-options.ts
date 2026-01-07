import type OpenAI from 'openai'

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
  include?: OpenAI.Audio.TranscriptionCreateParams['include']
  /**
   * The timestamp granularities to populate for this transcription.
   * response_format must be set to verbose_json to use timestamp granularities.
   * Either or both of these options are supported: word, or segment.
   */
  timestamp_granularities?: Array<'word' | 'segment'>
  /**
   * Optional list of speaker names that correspond to the audio samples provided in known_speaker_references[]. Each entry should be a short identifier (for example customer or agent). Up to 4 speakers are supported.
   */
  known_speaker_names?: Array<string>
  /**
   * Optional list of audio samples (as data URLs) that contain known speaker references matching known_speaker_names[]. Each sample must be between 2 and 10 seconds, and can use any of the same input audio formats supported by file.
   */
  known_speaker_references?: Array<string>
}
