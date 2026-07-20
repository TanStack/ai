import { useState } from 'react'
import {
  fetchHttpStream,
  fetchServerSentEvents,
  useGenerateImage,
} from '@tanstack/ai-react'
import type { MediaPrompt } from '@tanstack/ai'
import type { Mode, Provider } from '@/lib/types'
import { generateImageFn } from '@/lib/server-functions'

interface ImageGenUIProps {
  provider: Provider
  mode: Mode
  testId?: string
  aimockPort?: number
  /** Show a file input and send the prompt as multimodal parts (image-to-image). */
  withImageInput?: boolean
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Unexpected FileReader result'))
        return
      }
      resolve(result.split(',')[1] ?? '')
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

export function ImageGenUI({
  provider,
  mode,
  testId,
  aimockPort,
  withImageInput,
}: ImageGenUIProps) {
  const [prompt, setPrompt] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)

  const connectionOptions = () => {
    const body = { provider, numberOfImages: 1, testId, aimockPort }

    if (mode === 'sse') {
      return { connection: fetchServerSentEvents('/api/image'), body }
    }
    if (mode === 'http-stream') {
      return { connection: fetchHttpStream('/api/image/stream'), body }
    }
    return {
      fetcher: async (input: { prompt: MediaPrompt }) => {
        return generateImageFn({
          data: {
            prompt: input.prompt,
            provider,
            numberOfImages: 1,
            aimockPort,
            testId,
          },
        })
      },
    }
  }

  const { generate, result, isLoading, error, status } =
    useGenerateImage(connectionOptions())

  const handleGenerate = async () => {
    if (!imageFile) {
      await generate({ prompt })
      return
    }
    const base64 = await fileToBase64(imageFile)
    await generate({
      prompt: [
        { type: 'text', content: prompt },
        {
          type: 'image',
          source: { type: 'data', value: base64, mimeType: imageFile.type },
        },
      ],
    })
  }

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
          onClick={handleGenerate}
          disabled={!prompt.trim() || isLoading}
          className="px-4 py-2 bg-orange-500 text-white rounded text-sm font-medium disabled:opacity-50"
        >
          Generate
        </button>
      </div>
      {withImageInput && (
        <input
          data-testid="image-input"
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          className="text-sm text-gray-400"
        />
      )}
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
