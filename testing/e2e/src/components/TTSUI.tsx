import { useState } from 'react'
import {
  useGenerateSpeech,
  fetchServerSentEvents,
  fetchHttpStream,
} from '@tanstack/ai-react'
import { generateSpeechFn } from '@/lib/server-functions'
import type { TTSResult } from '@tanstack/ai'
import type { Mode, Provider } from '@/lib/types'

interface TTSUIProps {
  provider: Provider
  mode: Mode
  testId?: string
  aimockPort?: number
}

export function TTSUI({ provider, mode, testId, aimockPort }: TTSUIProps) {
  const [text, setText] = useState('')

  const connectionOptions = () => {
    const body = { provider, testId, aimockPort }

    if (mode === 'sse') {
      return { connection: fetchServerSentEvents('/api/tts'), body }
    }
    if (mode === 'http-stream') {
      return { connection: fetchHttpStream('/api/tts/stream'), body }
    }
    return {
      fetcher: async (input: { text: string; voice?: string }) => {
        return generateSpeechFn({
          data: {
            text: input.text,
            voice: input.voice,
            provider,
            aimockPort,
            testId,
          },
        }) as Promise<TTSResult>
      },
    }
  }

  const { generate, result, isLoading, error, status } =
    useGenerateSpeech(connectionOptions())

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <input
          data-testid="text-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Text to speak..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <button
          data-testid="generate-button"
          onClick={() => generate({ text })}
          disabled={!text.trim() || isLoading}
          className="px-4 py-2 bg-orange-500 text-white rounded text-sm font-medium disabled:opacity-50"
        >
          Generate
        </button>
      </div>
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
        <audio
          data-testid="generated-audio"
          src={`data:audio/${result.format || 'mp3'};base64,${result.audio}`}
          controls
        />
      )}
    </div>
  )
}
