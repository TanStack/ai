import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useGenerateImage } from '@tanstack/ai-react'
import type { UseGenerateImageReturn } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { resolveMediaPrompt } from '@tanstack/ai'
import { generateImageFn, generateImageStreamFn } from '../lib/server-fns'
import { generationPersistence } from '../lib/generation-persistence'

// This page shows BOTH persistence modes, each on the transport that supports
// it — the mode is not a separate tab, it follows from how the run is sent.
//
// - **Streaming** uses `persistence: true` (server-driven). The browser caches
//   nothing; the server holds the run record AND the bytes, so a reload restores
//   the image itself. Restore is a `GET` round-trip, which is why it needs a
//   `connection` — see `StreamingImageGeneration`.
// - **Direct** / **Server Fn** go through TanStack server functions, which have
//   no `GET` hydration path, so `persistence: true` cannot work there. They use
//   the client adapter below: a lightweight resume snapshot (run identity,
//   status, errors, result metadata — never image bytes) written to
//   localStorage under `generation:<threadId>` and read back on mount. Because
//   the bytes are never cached, `result` returns without its image.
const imagePersistence = generationPersistence

function StreamingImageGeneration() {
  const [prompt, setPrompt] = useState('')
  const [numberOfImages, setNumberOfImages] = useState(1)

  const hookReturn = useGenerateImage({
    id: 'image:streaming',
    // Required by `persistence`, and the scope the server files the run under.
    threadId: 'image:streaming',
    connection: fetchServerSentEvents('/api/generate/image'),
    // Server-driven: the browser caches nothing. On mount the hook issues a
    // `GET /api/generate/image?threadId=…`, answered by `reconstructGeneration`
    // from the `generationRuns` store. Only a `connection` can do this — the
    // fetcher-based variants below have no GET path, so they use the adapter.
    persistence: true,
  })

  return (
    <ImageGenerationUI
      {...hookReturn}
      prompt={prompt}
      setPrompt={setPrompt}
      numberOfImages={numberOfImages}
      setNumberOfImages={setNumberOfImages}
    />
  )
}

function DirectImageGeneration() {
  const [prompt, setPrompt] = useState('')
  const [numberOfImages, setNumberOfImages] = useState(1)

  const hookReturn = useGenerateImage({
    id: 'image:direct',
    threadId: 'image:direct',
    fetcher: (input) =>
      generateImageFn({
        data: { ...input, prompt: resolveMediaPrompt(input.prompt).text },
      }),
    persistence: imagePersistence,
  })

  return (
    <ImageGenerationUI
      {...hookReturn}
      prompt={prompt}
      setPrompt={setPrompt}
      numberOfImages={numberOfImages}
      setNumberOfImages={setNumberOfImages}
    />
  )
}

function ServerFnImageGeneration() {
  const [prompt, setPrompt] = useState('')
  const [numberOfImages, setNumberOfImages] = useState(1)

  const hookReturn = useGenerateImage({
    id: 'image:server-fn',
    threadId: 'image:server-fn',
    fetcher: (input) =>
      generateImageStreamFn({
        data: { ...input, prompt: resolveMediaPrompt(input.prompt).text },
      }),
    persistence: imagePersistence,
  })

  return (
    <ImageGenerationUI
      {...hookReturn}
      prompt={prompt}
      setPrompt={setPrompt}
      numberOfImages={numberOfImages}
      setNumberOfImages={setNumberOfImages}
    />
  )
}

function ImageGenerationUI({
  prompt,
  setPrompt,
  numberOfImages,
  setNumberOfImages,
  generate,
  result,
  isLoading,
  error,
  reset,
}: UseGenerateImageReturn & {
  prompt: string
  setPrompt: (v: string) => void
  numberOfImages: number
  setNumberOfImages: (v: number) => void
}) {
  const handleGenerate = () => {
    if (!prompt.trim()) return
    generate({ prompt: prompt.trim(), numberOfImages })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm text-gray-400">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image you want to generate..."
          className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
          rows={3}
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && prompt.trim()) {
              e.preventDefault()
              handleGenerate()
            }
          }}
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm text-gray-400">Number of Images</label>
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => setNumberOfImages(n)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                numberOfImages === n
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleGenerate}
          disabled={!prompt.trim() || isLoading}
          className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isLoading ? 'Generating...' : 'Generate Image'}
        </button>
        {result && (
          <button
            onClick={reset}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error.message}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {result.images.map((img, i) => (
            <img
              key={i}
              src={img.url || `data:image/png;base64,${img.b64Json}`}
              alt={img.revisedPrompt || prompt}
              className="w-full rounded-lg border border-gray-700"
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ImageGenerationPage() {
  const [mode, setMode] = useState<'streaming' | 'direct' | 'server-fn'>(
    'streaming',
  )

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Image Generation</h2>
            <p className="text-sm text-gray-400 mt-1">
              Generate images using xAI's Grok Imagine models
            </p>
          </div>
          <div className="flex gap-1 bg-gray-900/50 rounded-lg p-1">
            <button
              onClick={() => setMode('streaming')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'streaming'
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Streaming
            </button>
            <button
              onClick={() => setMode('direct')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'direct'
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Direct
            </button>
            <button
              onClick={() => setMode('server-fn')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                mode === 'server-fn'
                  ? 'bg-orange-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Server Fn
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {mode === 'streaming' ? (
            <StreamingImageGeneration key="streaming" />
          ) : mode === 'direct' ? (
            <DirectImageGeneration key="direct" />
          ) : (
            <ServerFnImageGeneration key="server-fn" />
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/generations/image')({
  component: ImageGenerationPage,
})
