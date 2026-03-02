import { useState } from 'react'
import { ImageIcon, Loader2, Shuffle } from 'lucide-react'
import type { ImageGenerationResult } from '@tanstack/ai'

import { generateImageFn } from '@/lib/server-functions'
import { getRandomImagePrompt } from '@/lib/prompts'
import { IMAGE_MODELS } from '@/lib/models'

interface ImageGeneratorProps {
  onImageGenerated?: (imageUrl: string) => void
}

type ModelResult = {
  status: 'loading' | 'success' | 'error'
  result?: ImageGenerationResult
  error?: string
}

function getImageSrc(image: { url?: string; b64Json?: string }): string {
  if (image.url) return image.url
  if (image.b64Json) return `data:image/png;base64,${image.b64Json}`
  return ''
}

const falModels = IMAGE_MODELS.filter((m) => m.provider === 'fal')
const geminiModels = IMAGE_MODELS.filter((m) => m.provider === 'gemini')

export default function ImageGenerator({
  onImageGenerated,
}: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<Record<string, ModelResult>>({})

  const currentModel = IMAGE_MODELS.find((m) => m.id === selectedModel)

  const handleGenerate = async () => {
    if (!prompt.trim()) return

    setIsLoading(true)
    setResults({})

    if (selectedModel === 'all') {
      // Initialize all models as loading
      const initialResults: Record<string, ModelResult> = {}
      for (const model of IMAGE_MODELS) {
        initialResults[model.id] = { status: 'loading' }
      }
      setResults(initialResults)

      // Fire all requests in parallel
      const promises = IMAGE_MODELS.map(async (model) => {
        try {
          const response = await generateImageFn({
            data: { prompt, model: model.id },
          })
          setResults((prev) => ({
            ...prev,
            [model.id]: { status: 'success', result: response },
          }))
          const image = response.images[0]
          if (image) {
            onImageGenerated?.(getImageSrc(image))
          }
        } catch (err) {
          setResults((prev) => ({
            ...prev,
            [model.id]: {
              status: 'error',
              error:
                err instanceof Error ? err.message : 'Failed to generate image',
            },
          }))
        }
      })

      await Promise.allSettled(promises)
      setIsLoading(false)
    } else {
      // Single model generation
      setResults({ [selectedModel]: { status: 'loading' } })

      try {
        const response = await generateImageFn({
          data: { prompt, model: selectedModel },
        })
        setResults({ [selectedModel]: { status: 'success', result: response } })
        const image = response.images[0]
        if (image) {
          onImageGenerated?.(getImageSrc(image))
        }
      } catch (err) {
        setResults({
          [selectedModel]: {
            status: 'error',
            error:
              err instanceof Error ? err.message : 'Failed to generate image',
          },
        })
      } finally {
        setIsLoading(false)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isLoading}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:opacity-50"
          >
            <option value="all">All Models</option>
            <optgroup label="fal.ai">
              {falModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Gemini">
              {geminiModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </optgroup>
          </select>
          {currentModel && selectedModel !== 'all' && (
            <p className="mt-1 text-xs text-gray-500">
              {currentModel.description}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">Prompt</label>
            <button
              onClick={() => setPrompt(getRandomImagePrompt())}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Shuffle className="w-3.5 h-3.5" />
              Shuffle
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate..."
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            rows={3}
            disabled={isLoading}
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={isLoading || !prompt.trim()}
          className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <ImageIcon className="w-5 h-5" />
              Generate Image
            </>
          )}
        </button>
      </div>

      {Object.keys(results).length > 0 && (
        <div className="space-y-6">
          <h3 className="text-lg font-medium text-white">
            {selectedModel === 'all' ? 'Generated Images' : 'Generated Image'}
          </h3>
          {Object.entries(results).map(([modelId, modelResult]) => {
            const model = IMAGE_MODELS.find((m) => m.id === modelId)
            return (
              <div key={modelId} className="space-y-2">
                {selectedModel === 'all' && (
                  <h4 className="text-sm font-medium text-gray-300">
                    {model?.name ?? modelId}
                  </h4>
                )}
                {modelResult.status === 'loading' && (
                  <div className="flex items-center gap-2 p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                    <span className="text-gray-400">Generating...</span>
                  </div>
                )}
                {modelResult.status === 'error' && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                    {modelResult.error}
                  </div>
                )}
                {modelResult.status === 'success' &&
                  modelResult.result &&
                  modelResult.result.images.length > 0 && (
                    <div className="rounded-lg overflow-hidden border border-gray-700">
                      <img
                        src={getImageSrc(modelResult.result.images[0]!)}
                        alt={`Generated by ${model?.name ?? modelId}`}
                        className="w-full h-auto"
                      />
                    </div>
                  )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
