export type OpenAITTSVoice =
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

export type OpenAITTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'

export interface OpenAITTSProviderOptions {
  instructions?: string
}
