export type GroqTTSEnglishVoice =
  | 'autumn'
  | 'diana'
  | 'hannah'
  | 'austin'
  | 'daniel'
  | 'troy'

export type GroqTTSArabicVoice = 'fahad' | 'sultan' | 'lulwa' | 'noura'

export type GroqTTSVoice = GroqTTSEnglishVoice | GroqTTSArabicVoice

export type GroqTTSFormat = 'flac' | 'mp3' | 'mulaw' | 'ogg' | 'wav'

export type GroqTTSSampleRate =
  | 8000
  | 16000
  | 22050
  | 24000
  | 32000
  | 44100
  | 48000

export interface GroqTTSProviderOptions {
  sample_rate?: GroqTTSSampleRate
}
