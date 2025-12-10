/**
 * Gemini-specific transcription provider options.
 *
 * Since Gemini doesn't have a dedicated transcription API, transcription is
 * performed by sending audio to the chat API with a transcription prompt.
 * These options allow customization of that process.
 */
export interface GeminiTranscriptionProviderOptions {
  /**
   * Custom prompt to use for transcription.
   * If not provided, a default prompt will be used.
   * @default "Transcribe the following audio accurately. Output only the transcription text, nothing else."
   */
  transcriptionPrompt?: string

  /**
   * Temperature for the model (0-2).
   * Lower values produce more deterministic output.
   * @default 0.1
   */
  temperature?: number

  /**
   * Maximum tokens to generate for the transcription.
   * @default 8192
   */
  maxOutputTokens?: number

  /**
   * If true, include timestamps in the transcription.
   * Note: This relies on the model's ability to infer timestamps.
   * @default false
   */
  includeTimestamps?: boolean

  /**
   * Language hint for the audio content.
   * Provide an ISO-639-1 language code (e.g., "en", "es", "fr").
   */
  languageHint?: string

  /**
   * Speaker diarization configuration.
   * If provided, the model will attempt to identify different speakers.
   */
  speakerDiarization?: {
    /**
     * Enable speaker diarization.
     */
    enabled: boolean
    /**
     * Expected number of speakers (optional).
     */
    expectedSpeakerCount?: number
  }
}
