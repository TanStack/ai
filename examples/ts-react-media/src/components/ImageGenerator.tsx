import { useCallback, useEffect, useRef, useState } from 'react'
import { ImageIcon, Loader2, Plus, Shuffle, Wand2, X } from 'lucide-react'
import { useGenerateImage } from '@tanstack/ai-react'
import type { MediaPrompt } from '@tanstack/ai/client'

import { generateImageFn } from '@/lib/server-functions'
import { getRandomImagePrompt } from '@/lib/prompts'
import { IMAGE_MODELS } from '@/lib/models'
import type { ImageModel } from '@/lib/models'
import { readMediaFile, toImagePart } from '@/lib/media'
import type { AttachedMedia } from '@/lib/media'

interface ImageGeneratorProps {
  onImageGenerated?: (imageUrl: string) => void
}

/** How the parent asks one card to run: the built prompt, nothing else. */
type ImageRunner = (prompt: MediaPrompt) => void

function getImageSrc(image: { url?: string; b64Json?: string }): string {
  if (image.url) return image.url
  if (image.b64Json) return `data:image/png;base64,${image.b64Json}`
  return ''
}

const falModels = IMAGE_MODELS.filter((m) => m.provider === 'fal')
const geminiModels = IMAGE_MODELS.filter((m) => m.provider === 'gemini')
const xaiModels = IMAGE_MODELS.filter((m) => m.provider === 'xai')
const byteplusModels = IMAGE_MODELS.filter((m) => m.provider === 'byteplus')

export default function ImageGenerator({
  onImageGenerated,
}: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>('all')
  const [images, setImages] = useState<Array<AttachedMedia>>([])
  /** Whether anything has been generated for the current model selection. */
  const [submitted, setSubmitted] = useState(false)
  const [running, setRunning] = useState<Record<string, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Generation is started from the click, not from an effect on the cards:
  // a hook only exists inside a mounted component, so the cards mount with
  // the picker and hand the parent a way to run them.
  const runnersRef = useRef(new Map<string, ImageRunner>())

  const currentModel = IMAGE_MODELS.find((m) => m.id === selectedModel)
  const activeModels =
    selectedModel === 'all'
      ? IMAGE_MODELS
      : IMAGE_MODELS.filter((model) => model.id === selectedModel)
  // Each card owns its own generation, so the form's busy state is the union
  // of what the cards report.
  const isLoading = Object.values(running).some(Boolean)

  // When images are attached, send an ordered parts array (text first, then one
  // image part per attachment). Otherwise send the plain string. Only image-capable
  // models accept image inputs — unsupported models surface a server error.
  const buildPrompt = (): MediaPrompt => {
    if (images.length === 0) return prompt
    return [
      { type: 'text', content: prompt },
      ...images.map((image) => toImagePart(image, { role: 'reference' })),
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

  const handleRunningChange = useCallback((modelId: string, value: boolean) => {
    setRunning((prev) =>
      prev[modelId] === value ? prev : { ...prev, [modelId]: value },
    )
  }, [])

  const registerRunner = useCallback(
    (modelId: string, run: ImageRunner | null) => {
      if (run) runnersRef.current.set(modelId, run)
      else runnersRef.current.delete(modelId)
    },
    [],
  )

  const handleGenerate = () => {
    if (!prompt.trim()) return
    const built = buildPrompt()
    setSubmitted(true)
    for (const model of activeModels) {
      runnersRef.current.get(model.id)?.(built)
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
            onChange={(e) => {
              setSelectedModel(e.target.value)
              // The results below belong to the models that produced them.
              setSubmitted(false)
              setRunning({})
            }}
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
            <optgroup label="BytePlus (direct)">
              {byteplusModels.map((model) => (
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
              Sent as image prompt parts with role &quot;reference&quot; —
              accepted by the Gemini multimodal models, xAI Imagine and Seedream
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

      <div className="space-y-6">
        {submitted && (
          <h3 className="text-lg font-medium text-white">
            {activeModels.length > 1 ? 'Generated Images' : 'Generated Image'}
          </h3>
        )}
        {activeModels.map((model) => (
          <ImageModelCard
            key={model.id}
            model={model}
            visible={submitted}
            showTitle={activeModels.length > 1}
            onRegister={registerRunner}
            onRunningChange={handleRunningChange}
            onImageGenerated={onImageGenerated}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * One model's generation. `useGenerateImage` owns the request lifecycle, so
 * the card only decides what to render for each of its states — there is no
 * per-model status bookkeeping left in the parent.
 */
function ImageModelCard({
  model,
  visible,
  showTitle,
  onRegister,
  onRunningChange,
  onImageGenerated,
}: {
  model: ImageModel
  visible: boolean
  showTitle: boolean
  onRegister: (modelId: string, run: ImageRunner | null) => void
  onRunningChange: (modelId: string, running: boolean) => void
  onImageGenerated?: (imageUrl: string) => void
}) {
  const [editPrompt, setEditPrompt] = useState('')
  const { generate, result, isLoading, error } = useGenerateImage({
    threadId: `image:${model.id}`,
    // The model is fixed for this card, so the server function's per-model
    // switch is picked here rather than being sent as a request field.
    // `options.signal` is the hook's abort signal — forwarding it lets an
    // unmount or a `stop()` cancel the request rather than orphan it.
    fetcher: (input, options) =>
      generateImageFn({
        data: {
          prompt: input.prompt,
          model: model.id,
          ...(input.previousImage
            ? { previousImage: input.previousImage }
            : {}),
        },
        signal: options?.signal,
      }),
    onResult: (generated) => {
      const image = generated.images[0]
      if (image) onImageGenerated?.(getImageSrc(image))
    },
  })

  const run = useCallback(
    (prompt: MediaPrompt) => {
      // Deliberately not `reset()` first: reset stops the client, which clears
      // the `isLoading` that makes a second `generate()` a no-op — that guard
      // is what swallows a double-click. The stale result a failed re-run
      // leaves behind is handled by the render gate below instead.
      void generate({ prompt })
    },
    [generate],
  )

  useEffect(() => {
    onRegister(model.id, run)
    return () => onRegister(model.id, null)
  }, [model.id, run, onRegister])

  useEffect(() => {
    onRunningChange(model.id, isLoading)
  }, [model.id, isLoading, onRunningChange])

  if (!visible) return null

  const image = result?.images[0]

  return (
    <div className="space-y-2">
      {showTitle && (
        <h4 className="text-sm font-medium text-gray-300">{model.name}</h4>
      )}
      {isLoading && (
        <div className="flex items-center gap-2 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
          <span className="text-gray-400">Generating...</span>
        </div>
      )}
      {error && !isLoading && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error.message}
        </div>
      )}
      {/* `!error`: a failed re-run keeps the previous result on the hook, and
          it must not render underneath the new error. */}
      {image && !isLoading && !error && (
        <>
          <div className="rounded-lg overflow-hidden border border-gray-700">
            <img
              src={getImageSrc(image)}
              alt={`Generated by ${model.name}`}
              className="w-full h-auto"
            />
          </div>
          {result?.usage?.billed && (
            <p className="text-xs text-gray-500">
              Billed {result.usage.billed.quantity}{' '}
              {result.usage.billed.unit === 'units'
                ? `fal unit${result.usage.billed.quantity === 1 ? '' : 's'}`
                : result.usage.billed.unit}{' '}
              — multiply by the endpoint unit price for USD cost
            </p>
          )}
          {(model.provider === 'xai' ||
            model.provider === 'byteplus' ||
            (model.provider === 'gemini' &&
              !model.id.startsWith('imagen'))) && (
            <div className="flex gap-2">
              <input
                type="text"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const next = editPrompt.trim()
                    if (!next || !result.images[0] || isLoading) return
                    const source = result.images[0]
                    setEditPrompt('')
                    void generate({ prompt: next, previousImage: source })
                  }
                }}
                placeholder="Describe an edit..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
              <button
                onClick={() => {
                  const next = editPrompt.trim()
                  if (!next || !result.images[0] || isLoading) return
                  const source = result.images[0]
                  setEditPrompt('')
                  void generate({ prompt: next, previousImage: source })
                }}
                disabled={!editPrompt.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Wand2 className="w-4 h-4" />
                Edit
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
