import type { TranscriptionResponseFormat } from '@tanstack/ai'

export type LovableTranscriptionResponseFormat = TranscriptionResponseFormat

export interface LovableTranscriptionProviderOptions {
  temperature?: number
  response_format?: LovableTranscriptionResponseFormat
  prompt?: string
}
