import { TTS_MODELS } from '../models/audio'

export interface AudioProviderOptions {
  /**
   * The text to generate audio for. The maximum length is 4096 characters.
   */
  input: string
  /**
   * The audio model to use for generation.
   */
  model: string
  /**
   * The voice to use when generating audio.
   *  Supported voices are alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, and verse.
   * Previews of the voices are available on the following url:
   * https://platform.openai.com/docs/guides/text-to-speech#voice-options
   */
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
  /**
   * Control the voice of your generated audio with additional instructions. Does not work with tts-1 or tts-1-hd.
   */
  instructions?: string
  /**
   * The format of the generated audio.
   * @default "mp3"
   */
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  /**
   * The speed of the generated audio.
   * Range of values between 0.25 to 4.0, where 1.0 is the default speed.
   * @default 1.0
   */
  speed?: number
  /**
   * The format to stream the audio in. Supported formats are sse and audio. sse is not supported for tts-1 or tts-1-hd.
   */
  stream_format?: 'sse' | 'audio'
}

/**
 * Validates the requested stream format against the selected TTS model.
 */
export const validateStreamFormat = (options: AudioProviderOptions) => {
  if (!Object.hasOwn(TTS_MODELS, options.model)) {
    if (options.stream_format) {
      console.warn(
        `Unknown TTS model: ${options.model}. stream_format may not be supported.`,
      )
    }
    return
  }

  const modelMeta = TTS_MODELS[options.model as keyof typeof TTS_MODELS]
  if (options.stream_format && !modelMeta.supportsStreaming) {
    throw new Error(`The model ${options.model} does not support streaming.`)
  }
}

/**
 * Validates that the requested speech speed falls within OpenAI's supported range.
 */
export const validateSpeed = (options: AudioProviderOptions) => {
  if (options.speed) {
    if (options.speed < 0.25 || options.speed > 4.0) {
      throw new Error('Speed must be between 0.25 and 4.0.')
    }
  }
}

/**
 * Validates that the selected TTS model supports voice instructions.
 */
export const validateInstructions = (options: AudioProviderOptions) => {
  if (!Object.hasOwn(TTS_MODELS, options.model)) {
    throw new Error(`Unknown TTS model: ${options.model}`)
  }

  const modelMeta = TTS_MODELS[options.model as keyof typeof TTS_MODELS]
  if (options.instructions && !modelMeta.supportsInstructions) {
    throw new Error(`The model ${options.model} does not support instructions.`)
  }
}

/**
 * Validates the maximum input length for text-to-speech requests.
 */
export const validateAudioInput = (options: AudioProviderOptions) => {
  if (options.input.length > 4096) {
    throw new Error('Input text exceeds maximum length of 4096 characters.')
  }
}
