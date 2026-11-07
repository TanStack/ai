export const CARTESIA_TTS_MODELS = [
  'sonic-3.6',
  'sonic-3.5',
  'sonic-3',
  'sonic-latest',
] as const
export type CartesiaTTSModel = (typeof CARTESIA_TTS_MODELS)[number]

export const CARTESIA_TRANSCRIPTION_MODELS = ['ink-whisper'] as const
export type CartesiaTranscriptionModel =
  (typeof CARTESIA_TRANSCRIPTION_MODELS)[number]
