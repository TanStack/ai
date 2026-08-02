/**
 * Common audio provider options for Groq audio endpoints.
 */
export interface AudioProviderOptions {
  /**
   * The text to generate audio for.
   * Maximum length is 200 characters.
   * Use [directions] for vocal control (English voices only).
   */
  input: string
  /**
   * The audio model to use for generation.
   */
  model: string
}

/**
 * Validates that the audio input text does not exceed the maximum length.
 * @throws Error if input text exceeds 200 characters
 */
export const validateAudioInput = (options: AudioProviderOptions) => {
  if (options.input.length > 200) {
    throw new Error('Input text exceeds maximum length of 200 characters.')
  }
}
