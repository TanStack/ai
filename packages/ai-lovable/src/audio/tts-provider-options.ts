export type LovableTTSVoice =
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

export type LovableTTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'

export interface LovableTTSProviderOptions {
  /**
   * Extra voice direction in plain language, for example "speak slowly and warmly".
   */
  instructions?: string
}
