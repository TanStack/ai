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
   * The timestamp granularities to populate for this transcription.
   * response_format must be set to verbose_json to use timestamp granularities.
   * Either or both of these options are supported: word, or segment.
   */
  timestamp_granularities?: Array<'word' | 'segment'>
}
