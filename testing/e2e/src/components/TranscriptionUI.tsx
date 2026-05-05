import {
  useTranscription,
  fetchServerSentEvents,
  fetchHttpStream,
} from '@tanstack/ai-react'
import { generateTranscriptionFn } from '@/lib/server-functions'
import type { TranscriptionResult } from '@tanstack/ai'
import type { Mode, Provider } from '@/lib/types'

interface TranscriptionUIProps {
  provider: Provider
  mode: Mode
  testId?: string
  aimockPort?: number
}

// Minimal silent MP3 frame encoded as base64 — aimock matches on the decoded filename
// The adapter will decode this to a File object named "audio.mp3" for the multipart upload
const TEST_AUDIO_BASE64 = 'data:audio/mpeg;base64,SGVsbG8='

export function TranscriptionUI({
  provider,
  mode,
  testId,
  aimockPort,
}: TranscriptionUIProps) {
  const connectionOptions = () => {
    const body = { provider, testId, aimockPort }

    if (mode === 'sse') {
      return { connection: fetchServerSentEvents('/api/transcription'), body }
    }
    if (mode === 'http-stream') {
      return { connection: fetchHttpStream('/api/transcription/stream'), body }
    }
    return {
      fetcher: async (input: { audio: string; language?: string }) => {
        return generateTranscriptionFn({
          data: {
            audio: input.audio,
            language: input.language,
            provider,
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
        onClick={() => generate({ audio: TEST_AUDIO_BASE64, language: 'en' })}
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
        <p data-testid="transcription-text" className="text-gray-200">
          {result.text}
        </p>
      )}
    </div>
  )
}
