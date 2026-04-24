import { useState } from 'react'
import {
  useGenerateVideo,
  fetchServerSentEvents,
  fetchHttpStream,
} from '@tanstack/ai-react'
import { generateVideoFn } from '@/lib/server-functions'
import type { Mode, Provider } from '@/lib/types'
import type { VideoGenerateResult } from '@tanstack/ai-client'

interface VideoGenUIProps {
  provider: Provider
  mode: Mode
  testId?: string
  aimockPort?: number
}

export function VideoGenUI({
  provider,
  mode,
  testId,
  aimockPort,
}: VideoGenUIProps) {
  const [prompt, setPrompt] = useState('')

  const connectionOptions = () => {
    const body = { provider, testId, aimockPort }

    if (mode === 'sse') {
      return { connection: fetchServerSentEvents('/api/video'), body }
    }
    if (mode === 'http-stream') {
      return { connection: fetchHttpStream('/api/video/stream'), body }
    }
    return {
      fetcher: async (input: { prompt: string }) => {
        return generateVideoFn({
          data: { prompt: input.prompt, provider, aimockPort, testId },
        }) as Promise<VideoGenerateResult>
      },
    }
  }

  const { generate, result, videoStatus, isLoading, error, status } =
    useGenerateVideo(connectionOptions())

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <input
          data-testid="prompt-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the video..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
        />
        <button
          data-testid="generate-button"
          onClick={() => generate({ prompt })}
          disabled={!prompt.trim() || isLoading}
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
      {videoStatus && (
        <span data-testid="video-status" className="text-gray-400 text-sm">
          {videoStatus.status}
          {videoStatus.progress != null && ` (${videoStatus.progress}%)`}
        </span>
      )}
      {error && (
        <div data-testid="generation-error" className="text-red-400 text-sm">
          {error.message}
        </div>
      )}
      {result && result.url && (
        <video
          data-testid="generated-video"
          src={result.url}
          controls
          className="rounded border border-gray-700 max-w-lg"
        />
      )}
    </div>
  )
}
