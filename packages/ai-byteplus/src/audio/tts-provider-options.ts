import type {
  BytePlusTTSAudioFormat,
  BytePlusTTSReference,
  BytePlusTTSSampleRate,
  BytePlusTTSSubtitle,
} from './wire-types'
import type { TTSResult } from '@tanstack/ai'

export type BytePlusTTSVoice = 'en_female_stokie_uranus_bigtts' | (string & {})

export interface BytePlusTTSProviderOptions {
  speaker?: BytePlusTTSVoice
  references?: Array<BytePlusTTSReference>
  format?: BytePlusTTSAudioFormat
  sample_rate?: BytePlusTTSSampleRate
  pitch_rate?: number
  speech_rate?: number
  loudness_rate?: number
  enable_subtitle?: boolean
  watermark?: boolean
}

export interface BytePlusTTSResult extends TTSResult {
  subtitle?: BytePlusTTSSubtitle
  originalDuration?: number
  url?: string
}
