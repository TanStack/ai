import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useGenerateVideo } from '@tanstack/ai-react'
import type { UseGenerateVideoReturn } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { generateVideoFn, generateVideoStreamFn } from '../lib/server-fns'

function StreamingVideoGeneration() {
  const [prompt, setPrompt] = useState('')

  const hookReturn = useGenerateVideo({
    connection: fetchServerSentEvents('/api/generate/video'),
  })

  return (
    <VideoGenerationUI {...hookReturn} prompt={prompt} setPrompt={setPrompt} />
  )
}

function DirectVideoGeneration() {
  const [prompt, setPrompt] = useState('')

  const hookReturn = useGenerateVideo({
    fetcher: (input) => generateVideoFn({ data: input }),
  })

  return (
    <VideoGenerationUI {...hookReturn} prompt={prompt} setPrompt={setPrompt} />
  )
}

function ServerFnVideoGeneration() {
  const [prompt, setPrompt] = useState('')

  const hookReturn = useGenerateVideo({
    fetcher: (input) => generateVideoStreamFn({ data: input }),
  })

  return (
    <VideoGenerationUI {...hookReturn} prompt={prompt} setPrompt={setPrompt} />
  )
}

function VideoGenerationUI({
  prompt,
  setPrompt,
  generate,
  result,
  jobId,
  videoStatus,
  isLoading,
  error,
  stop,
  reset,
}: UseGenerateVideoReturn & {
  prompt: string
  setPrompt: (v: string) => void
}) {
  const handleGenerate = () => {
    if (!prompt.trim()) return
    generate({ prompt: prompt.trim() })
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
        <p className="text-yellow-400 text-sm">
          Video generation is experimental and requires Sora API access in your
          OpenAI account. Generation can take several minutes.
        </p>
      </div>

      <div className="space-y-3">
        <label className="text-sm text-gray-400">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the video you want to generate..."
          className="w-full rounded-lg border border-orange-500/20 bg-gray-800/50 px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
          rows={3}
          disabled={isLoading}
        />
        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isLoading}
            className="px-6 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {isLoading ? 'Generating...' : 'Generate Video'}
          </button>
          {isLoading && (
            <button
              onClick={stop}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          )}
          {result && (
            <button
              onClick={reset}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg space-y-3">
          {jobId && (
            <p className="text-sm text-gray-400">
              Job: <span className="font-mono text-gray-300">{jobId}</span>
            </p>
          )}
          {videoStatus && (
            <>
              <p className="text-sm text-gray-400">
                Status: <span className="text-white">{videoStatus.status}</span>
              </p>
              {videoStatus.progress != null && (
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-orange-500 h-2 rounded-full transition-all"
                    style={{ width: `${videoStatus.progress}%` }}
                  />
                </div>
              )}
            </>
          )}
          {!jobId && !videoStatus && (
            <p className="text-sm text-gray-400">Starting generation...</p>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-red-400 text-sm">{error.message}</p>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <video
            src={result.url}
            controls
            className="w-full rounded-lg border border-gray-700"
          />
        </div>
      )}
    </div>
  )
}

function VideoGenerationPage() {
  const [mode, setMode] = useState<'streaming' | 'direct' | 'server-fn'>(
    'streaming',
  )

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-gray-900 text-white">
      <div className="border-b border-orange-500/20 bg-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Video Generation</h2>
            <p className="text-sm text-gray-400 mt-1">
              Generate videos using OpenAI Sora (experimental)
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
            <StreamingVideoGeneration key="streaming" />
          ) : mode === 'direct' ? (
            <DirectVideoGeneration key="direct" />
          ) : (
            <ServerFnVideoGeneration key="server-fn" />
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/generations/video')({
  component: VideoGenerationPage,
})
