export type LovableTranscriptionResponseFormat = 'json' | 'text'

export interface LovableTranscriptionProviderOptions {
  temperature?: number
  response_format?: LovableTranscriptionResponseFormat
  prompt?: string
}
