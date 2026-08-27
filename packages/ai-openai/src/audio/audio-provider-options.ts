export interface AudioProviderOptions {
  input: string
  model: string
  voice?:
    | 'alloy'
    | 'ash'
    | 'ballad'
    | 'coral'
    | 'echo'
    | 'fable'
    | 'onyx'
    | 'nova'
    | 'sage'
    | 'shimmer'
    | 'verse'
  instructions?: string
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  speed?: number
  stream_format?: 'sse' | 'audio'
}

export const validateStreamFormat = (options: AudioProviderOptions) => {
  const unsupportedModels = ['tts-1', 'tts-1-hd']
  if (options.stream_format && unsupportedModels.includes(options.model)) {
    throw new Error(`The model ${options.model} does not support streaming.`)
  }
}

export const validateSpeed = (options: AudioProviderOptions) => {
  if (options.speed) {
    const isSpeedOutOfRange = options.speed < 0.25 || options.speed > 4.0
    if (isSpeedOutOfRange) {
      throw new Error('Speed must be between 0.25 and 4.0.')
    }
  }
}

export const validateInstructions = (options: AudioProviderOptions) => {
  const unsupportedModels = ['tts-1', 'tts-1-hd']
  if (options.instructions && unsupportedModels.includes(options.model)) {
    throw new Error(`The model ${options.model} does not support instructions.`)
  }
}

export const validateAudioInput = (options: AudioProviderOptions) => {
  if (options.input.length > 4096) {
    throw new Error('Input text exceeds maximum length of 4096 characters.')
  }
}
