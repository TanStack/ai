/**
 * Groq-specific options for audio transcription.
 *
 * These fields extend the shared `TranscriptionOptions` and are forwarded
 * verbatim to the Groq transcription endpoint.
 */
export interface GroqTranscriptionProviderOptions {
  /**
   * Sampling temperature between 0 and 1. Lower values produce more
   * deterministic output. Groq recommends 0 (the default) for most use cases.
   */
  temperature?: number

  /**
   * Granularity levels to include when `response_format` is `verbose_json`.
   * Pass `['word']`, `['segment']`, or both to control which timestamp arrays
   * appear in the result.
   */
  timestamp_granularities?: Array<'word' | 'segment'>
}
