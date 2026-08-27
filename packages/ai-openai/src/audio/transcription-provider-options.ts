import type OpenAI from 'openai'
import type { TranscriptionResponseFormat } from '@tanstack/ai'

export type OpenAITranscriptionResponseFormat =
  | TranscriptionResponseFormat
  | 'diarized_json'

export interface OpenAITranscriptionProviderOptions {
  temperature?: number
  include?: Exclude<
    OpenAI.Audio.TranscriptionCreateParams['include'],
    undefined
  >
  timestamp_granularities?: Array<'word' | 'segment'>
  response_format?: OpenAITranscriptionResponseFormat
  prompt?: string
  known_speaker_names?: Array<string>
  known_speaker_references?: Array<string>
  chunking_strategy?:
    | 'auto'
    | OpenAI.Audio.TranscriptionCreateParams.VadConfig
    | null
}
