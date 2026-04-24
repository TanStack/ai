import { useState } from 'react'
import {
  useGenerateImage,
  fetchServerSentEvents,
  fetchHttpStream,
} from '@tanstack/ai-react'
import { generateImageFn } from '@/lib/server-functions'
import type { ImageGenerationResult } from '@tanstack/ai'
import type { Mode, Provider } from '@/lib/types'

interface ImageGenUIProps {
  provider: Provider
  mode: Mode
  testId?: string
  aimockPort?: number
}

export function ImageGenUI({
  provider,
  mode,
  testId,
  aimockPort,
}: ImageGenUIProps) {
  const [prompt, setPrompt] = useState('')

  const connectionOptions = () => {
    const body = { provider, numberOfImages: 1, testId, aimockPort }

    if (mode === 'sse') {
      return { connection: fetchServerSentEvents('/api/image'), body }
    }
    if (mode === 'http-stream') {
      return { connection: fetchHttpStream('/api/image/stream'), body }
    }
    return {
      fetcher: async (input: { prompt: string }) => {
        return generateImageFn({
          data: {
            prompt: input.prompt,
            provider,
            numberOfImages: 1,
            aimockPort,
            testId,
          },
        }) as Promise<ImageGenerationResult>
      },
    }
  }

  const { generate, result, isLoading, error, status } =
    useGenerateImage(connectionOptions())

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <input
          data-testid="prompt-input"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image..."
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
      {error && (
        <div data-testid="generation-error" className="text-red-400 text-sm">
          {error.message}
        </div>
      )}
      {result && (
        <div className="grid grid-cols-2 gap-4">
          {result.images.map((img, i) => (
            <img
              key={i}
              data-testid="generated-image"
              src={img.url || `data:image/png;base64,${img.b64Json}`}
              alt={`Generated ${i + 1}`}
              className="rounded border border-gray-700"
            />
          ))}
        </div>
      )}
    </div>
  )
}
