export interface GroqTranscriptionProviderOptions {
  temperature?: number

  timestamp_granularities?: Array<'word' | 'segment'>
}
