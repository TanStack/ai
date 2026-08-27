export type GrokSTTAudioFormat =
  | 'pcm'
  | 'mulaw'
  | 'alaw'
  | 'wav'
  | 'mp3'
  | 'ogg'
  | 'opus'
  | 'flac'
  | 'aac'
  | 'mp4'
  | 'm4a'
  | 'mkv'

export interface GrokTranscriptionProviderOptions {
  audio_format?: GrokSTTAudioFormat
  sample_rate?: number
  inverse_text_normalization?: boolean
  multichannel?: boolean
  channels?: number
  diarize?: boolean
}
