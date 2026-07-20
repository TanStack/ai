import { useRef, useState } from 'react'
import { ImageIcon, Loader2, Plus, Shuffle, X } from 'lucide-react'
import type { ImageGenerationResult } from '@tanstack/ai'
import type { MediaPrompt } from '@tanstack/ai/client'

import { generateImageFn } from '@/lib/server-functions'
import { getRandomImagePrompt } from '@/lib/prompts'
import { IMAGE_MODELS } from '@/lib/models'
import { readMediaFile, toImagePart } from '@/lib/media'
import type { AttachedMedia } from '@/lib/media'

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
const xaiModels = IMAGE_MODELS.filter((m) => m.provider === 'xai')

export default function ImageGenerator({
  onImageGenerated,
}: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [results, setResults] = useState<Record<string, ModelResult>>({})
  const [images, setImages] = useState<Array<AttachedMedia>>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentModel = IMAGE_MODELS.find((m) => m.id === selectedModel)

  // When images are attached, send an ordered parts array (text first, then one
  // image part per attachment). Otherwise send the plain string. Only image-capable
  // models accept image inputs — unsupported models surface a server error.
  const buildPrompt = (): MediaPrompt => {
    if (images.length === 0) return prompt
    return [
      { type: 'text', content: prompt },
      ...images.map((image) => toImagePart(image)),
    ]
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (files.length === 0) return
    const attached = await Promise.all(files.map((file) => readMediaFile(file)))
    setImages((prev) => [...prev, ...attached])
  }

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((image) => image.id !== id))
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    const builtPrompt = buildPrompt()

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
            data: { prompt: builtPrompt, model: model.id },
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
          data: { prompt: builtPrompt, model: selectedModel },
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
            <optgroup label="xAI (direct)">
              {xaiModels.map((model) => (
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

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">
              Reference Images
            </label>
            <span className="text-xs text-gray-500">
              Supported by Gemini multimodal models only
              (gemini-3.1-flash-image-preview, gemini-3-pro-image-preview)
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {images.map((image) => (
              <div
                key={image.id}
                className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-700"
              >
                <img
                  src={image.dataUrl}
                  alt={image.name}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removeImage(image.id)}
                  disabled={isLoading}
                  className="absolute top-1 right-1 p-0.5 bg-gray-900/80 hover:bg-gray-800 rounded-full text-white disabled:opacity-50"
                  aria-label={`Remove ${image.name}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="w-20 h-20 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-lg text-gray-400 hover:text-gray-300 transition-colors disabled:opacity-50"
            >
              <Plus className="w-5 h-5" />
              <span className="text-xs">Add</span>
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
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
                    <>
                      <div className="rounded-lg overflow-hidden border border-gray-700">
                        <img
                          src={getImageSrc(modelResult.result.images[0]!)}
                          alt={`Generated by ${model?.name ?? modelId}`}
                          className="w-full h-auto"
                        />
                      </div>
                      {modelResult.result.usage?.unitsBilled != null && (
                        <p className="text-xs text-gray-500">
                          Billed {modelResult.result.usage.unitsBilled} fal unit
                          {modelResult.result.usage.unitsBilled === 1
                            ? ''
                            : 's'}{' '}
                          — multiply by the endpoint unit price for USD cost
                        </p>
                      )}
                    </>
                  )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
