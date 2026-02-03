import { useState } from 'react'
import { ImageIcon, Loader2, Shuffle } from 'lucide-react'
import { generateImage } from '@/lib/server-functions'
import type { ImageGenerationResult } from '@tanstack/ai'
import { getRandomImagePrompt } from '@/lib/prompts'
import { IMAGE_MODELS } from '@/lib/models'

interface ImageGeneratorProps {
  onImageGenerated?: (imageUrl: string) => void
}

export default function ImageGenerator({ onImageGenerated }: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>(IMAGE_MODELS[0].id)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ImageGenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const currentModel = IMAGE_MODELS.find((m) => m.id === selectedModel)

  const handleGenerate = async () => {
    if (!prompt.trim()) return

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await generateImage({ data: { prompt, model: selectedModel } })
      setResult(response)
      const imageUrl = response.images[0]?.url
      if (imageUrl) {
        onImageGenerated?.(imageUrl)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate image')
    } finally {
      setIsLoading(false)
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
            {IMAGE_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
          {currentModel && (
            <p className="mt-1 text-xs text-gray-500">{currentModel.description}</p>
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

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {result && result.images.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white">Generated Image</h3>
          <div className="rounded-lg overflow-hidden border border-gray-700">
            <img
              src={result.images[0]?.url}
              alt="Generated"
              className="w-full h-auto"
            />
          </div>
        </div>
      )}
    </div>
  )
}
