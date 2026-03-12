import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Download, Loader2, Send, X } from 'lucide-react'

interface GeneratedImage {
  url?: string
  b64Json?: string
  revisedPrompt?: string
}

interface ImageGenResult {
  id: string
  model: string
  images: Array<GeneratedImage>
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

const IMAGE_MODELS = [
  { value: 'openai/gpt-5-image-mini', label: 'OpenAI GPT-5 Image Mini' },
  { value: 'openai/gpt-5-image', label: 'OpenAI GPT-5 Image' },
  {
    value: 'google/gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash Image',
  },
  {
    value: 'google/gemini-2.5-flash-image-preview',
    label: 'Gemini 2.5 Flash Image Preview',
  },
  {
    value: 'google/gemini-3-pro-image-preview',
    label: 'Gemini 3 Pro Image Preview',
  },
] as const

const IMAGE_SIZES = [
  { value: '1024x1024', label: '1024x1024 (1:1)' },
  { value: '1248x832', label: '1248x832 (3:2)' },
  { value: '832x1248', label: '832x1248 (2:3)' },
  { value: '1184x864', label: '1184x864 (4:3)' },
  { value: '864x1184', label: '864x1184 (3:4)' },
  { value: '1344x768', label: '1344x768 (16:9)' },
  { value: '768x1344', label: '768x1344 (9:16)' },
] as const

function ImageGenPage() {
  const [prompt, setPrompt] = useState('')
  const [model, setModel] = useState<string>(IMAGE_MODELS[0].value)
  const [size, setSize] = useState<string>(IMAGE_SIZES[0].value)
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ImageGenResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<
    Array<{ prompt: string; result: ImageGenResult }>
  >([])

  async function handleGenerate() {
    if (!prompt.trim() || isLoading) return

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/image-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), model, size }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.error || `Request failed (${res.status})`)
      }

      const data: ImageGenResult = await res.json()
      setResult(data)
      setHistory((prev) => [{ prompt: prompt.trim(), result: data }, ...prev])
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setIsLoading(false)
    }
  }

  function getImageSrc(image: GeneratedImage): string | null {
    if (image.url) return image.url
    if (image.b64Json) return `data:image/png;base64,${image.b64Json}`
    return null
  }

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900">
      {/* Controls bar */}
      <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm text-gray-400 mb-2 block">Model:</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
            >
              {IMAGE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[180px]">
            <label className="text-sm text-gray-400 mb-2 block">Size:</label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
            >
              {IMAGE_SIZES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Current result */}
        {result && result.images.length > 0 && (
          <div className="mb-8">
            <div className="text-sm text-gray-400 mb-3">
              <span className="text-orange-400 font-medium">Prompt:</span>{' '}
              {history[0]?.prompt}
              {result.usage?.totalTokens != null && (
                <span className="ml-3 text-gray-500">
                  ({result.usage.totalTokens} tokens)
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              {result.images.map((image, i) => {
                const src = getImageSrc(image)
                if (!src) return null
                return (
                  <div key={i} className="relative group">
                    <img
                      src={src}
                      alt={image.revisedPrompt || prompt}
                      className="max-w-full rounded-lg border border-gray-700 shadow-lg"
                      style={{ maxHeight: '512px' }}
                    />
                    {image.revisedPrompt && (
                      <div className="mt-2 text-xs text-gray-500 max-w-md">
                        <span className="text-gray-400">Revised:</span>{' '}
                        {image.revisedPrompt}
                      </div>
                    )}
                    <a
                      href={src}
                      download={`image-${Date.now()}-${i}.png`}
                      className="absolute top-2 right-2 p-2 bg-gray-900/80 hover:bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Download"
                    >
                      <Download className="w-4 h-4 text-white" />
                    </a>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-gray-400 text-sm">Generating image...</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-start gap-3">
              <X className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium">Generation failed</p>
                <p className="text-red-300/70 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!result && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
            <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-gray-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
                />
              </svg>
            </div>
            <p className="text-sm">Enter a prompt below to generate an image</p>
          </div>
        )}

        {/* History */}
        {history.length > 1 && (
          <div className="mt-8 border-t border-gray-800 pt-6">
            <h3 className="text-sm font-medium text-gray-400 mb-4">
              Previous Generations
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {history.slice(1).map((entry, i) =>
                entry.result.images.map((image, j) => {
                  const src = getImageSrc(image)
                  if (!src) return null
                  return (
                    <div
                      key={`${i}-${j}`}
                      className="rounded-lg border border-gray-800 overflow-hidden bg-gray-800/30"
                    >
                      <img
                        src={src}
                        alt={entry.prompt}
                        className="w-full object-cover"
                        style={{ maxHeight: '200px' }}
                      />
                      <div className="p-2 text-xs text-gray-500 truncate">
                        {entry.prompt}
                      </div>
                    </div>
                  )
                }),
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-orange-500/10 bg-gray-900/80 backdrop-blur-sm">
        <div className="w-full px-4 py-3">
          <div className="relative flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 pl-4 pr-12 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-transparent resize-none overflow-hidden shadow-lg"
                rows={1}
                style={{ minHeight: '44px', maxHeight: '200px' }}
                disabled={isLoading}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height =
                    Math.min(target.scrollHeight, 200) + 'px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && prompt.trim()) {
                    e.preventDefault()
                    handleGenerate()
                  }
                }}
              />
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-orange-500 hover:text-orange-400 disabled:text-gray-500 transition-colors focus:outline-none"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/image-gen')({
  component: ImageGenPage,
})
