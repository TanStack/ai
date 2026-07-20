import {
  useTranscription,
  fetchServerSentEvents,
  fetchHttpStream,
} from '@tanstack/ai-react'
import { generateTranscriptionFn } from '@/lib/server-functions'
import type { TranscriptionResult } from '@tanstack/ai'
import type { TranscriptionGenerateInput } from '@tanstack/ai-client'
import type { Feature, Mode, Provider } from '@/lib/types'

type TranscriptionFeature = Extract<
  Feature,
  'transcription' | 'transcription-diarization'
>

interface TranscriptionUIProps {
  provider: Provider
  feature: TranscriptionFeature
  mode: Mode
  testId?: string
  aimockPort?: number
}

// Minimal silent MP3 frame encoded as base64 — aimock matches on the decoded filename
// The adapter will decode this to a File object named "audio.mp3" for the multipart upload
const TEST_AUDIO_BASE64 = 'data:audio/mpeg;base64,SGVsbG8='

export function TranscriptionUI({
  provider,
  feature,
  mode,
  testId,
  aimockPort,
}: TranscriptionUIProps) {
  const isDiarization = feature === 'transcription-diarization'
  const transcriptionInput: TranscriptionGenerateInput = {
    audio: TEST_AUDIO_BASE64,
    language: 'en',
    ...(isDiarization
      ? {
          modelOptions: {
            response_format: 'diarized_json',
            chunking_strategy: 'auto',
            known_speaker_names: ['agent', 'customer'],
            known_speaker_references: [TEST_AUDIO_BASE64, TEST_AUDIO_BASE64],
          },
        }
      : {}),
  }

  const connectionOptions = () => {
    const body = { provider, feature, testId, aimockPort }

    if (mode === 'sse') {
      return { connection: fetchServerSentEvents('/api/transcription'), body }
    }
    if (mode === 'http-stream') {
      return { connection: fetchHttpStream('/api/transcription/stream'), body }
    }
    return {
      fetcher: async (input: TranscriptionGenerateInput) => {
        return generateTranscriptionFn({
          data: {
            audio: input.audio as string,
            language: input.language,
            responseFormat: input.responseFormat,
            modelOptions: input.modelOptions,
            provider,
            feature,
            aimockPort,
            testId,
          },
        }) as Promise<TranscriptionResult>
      },
    }
  }

  const { generate, result, isLoading, error, status } =
    useTranscription(connectionOptions())

  return (
    <div className="p-4 space-y-4">
      <button
        data-testid="generate-button"
        onClick={() => generate(transcriptionInput)}
        disabled={isLoading}
        className="px-4 py-2 bg-orange-500 text-white rounded text-sm font-medium disabled:opacity-50"
      >
        Transcribe
      </button>
      <div data-testid="generation-status">
        {status === 'idle'
          ? 'idle'
          : isLoading
            ? 'loading'
            : error
              ? 'error'
              : result
                ? 'complete'
                : 'idle'}
      </div>
      {error && (
        <div data-testid="generation-error" className="text-red-400 text-sm">
          {error.message}
        </div>
      )}
      {result && (
        <div className="space-y-3">
          <p data-testid="transcription-text" className="text-gray-200">
            {result.text}
          </p>
          {result.segments && result.segments.length > 0 && (
            <div data-testid="transcription-segments" className="space-y-2">
              {result.segments.map((segment, index) => (
                <div key={index} className="text-sm text-gray-200">
                  {segment.speaker && (
                    <span
                      data-testid={`transcription-speaker-${index}`}
                      className="mr-2 font-semibold text-orange-300"
                    >
                      {segment.speaker}
                    </span>
                  )}
                  <span>{segment.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
