export type GrokTTSVoice = 'eve' | 'ara' | 'rex' | 'sal' | 'leo'

export type GrokTTSCodec = 'mp3' | 'wav' | 'pcm' | 'mulaw' | 'alaw'

export interface GrokTTSProviderOptions {
  language?: string
  codec?: GrokTTSCodec
  sample_rate?: 8000 | 16000 | 22050 | 24000 | 44100 | 48000
  bit_rate?: 32000 | 64000 | 96000 | 128000 | 192000
  optimize_streaming_latency?: 0 | 1
  text_normalization?: boolean
}
