import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'
import { OpenRouterKeyForm } from '@/components/open-router-key-form'
import { byok } from '@/lib/byok'

// OpenRouter returns a public URL or raw base64. <img src> accepts both.
function imageSrc(image: { url?: string; b64Json?: string }) {
  if (image.url) return image.url
  if (image.b64Json) return `data:image/png;base64,${image.b64Json}`
  return undefined
}

function ImagePage() {
  const [prompt, setPrompt] = useState('')
  // POST { prompt } to /api/generate/image over SSE.
  // byok sends the OpenRouter key as x-byok-openrouter.
  // When the stream ends, result.images holds the picture.
  const { generate, result, isLoading, error, stop, reset } = useGenerateImage({
    connection: fetchServerSentEvents('/api/generate/image'),
    byok,
  })

  const handleGenerate = () => {
    const next = prompt.trim()
    if (!next) return
    void generate({ prompt: next })
  }

  return (
    <div className="flex h-screen bg-gray-900">
      <div className="flex w-full flex-col">
        <div className="border-b border-orange-500/20 bg-gray-800 px-4 py-3">
          <OpenRouterKeyForm />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto max-w-2xl">
            {result?.images[0] ? (
              <img
                src={imageSrc(result.images[0])}
                alt={prompt.trim() || 'Generated image'}
                className="w-full rounded-lg border border-orange-500/20"
              />
            ) : (
              <div className="text-center">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  Generate Image
                </h2>
                <p className="text-sm text-gray-400">
                  Paste an OpenRouter key. Then describe an image.
                </p>
              </div>
            )}
          </div>
        </div>

        {error ? (
          <div className="mx-4 mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error.message}
          </div>
        ) : null}

        <div className="border-t border-orange-500/10 bg-gray-900/80">
          <div className="w-full px-4 py-3">
            {isLoading ? (
              <div className="mb-3 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={stop}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  Stop
                </button>
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="A watercolor lighthouse at dusk"
                className="w-full resize-none rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                rows={2}
                disabled={isLoading}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    prompt.trim()
                  ) {
                    event.preventDefault()
                    handleGenerate()
                  }
                }}
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!prompt.trim() || isLoading}
                className="rounded-lg bg-orange-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                Generate
              </button>
              {result ? (
                <button
                  type="button"
                  onClick={reset}
                  disabled={isLoading}
                  className="rounded-lg border border-gray-600 px-4 py-3 text-sm text-gray-200 disabled:opacity-50"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: ImagePage,
})
