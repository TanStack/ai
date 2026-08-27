export interface AudioProviderOptions {
  input: string
  model: string
}

export const validateAudioInput = (options: AudioProviderOptions) => {
  if (options.input.length > 200) {
    throw new Error('Input text exceeds maximum length of 200 characters.')
  }
}
