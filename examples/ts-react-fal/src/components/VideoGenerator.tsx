import { useEffect, useRef, useState } from 'react'
import { Film, Loader2, Shuffle, Upload, X } from 'lucide-react'
import {
  createVideoJob,
  getVideoStatus,
  getVideoUrl,
} from '@/lib/server-functions'
import type { VideoMode } from '@/lib/models'
import { VIDEO_MODELS } from '@/lib/models'
import { getRandomVideoPrompt } from '@/lib/prompts'

type JobState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'pending'; jobId: string; model: string }
  | { status: 'processing'; jobId: string; model: string; progress?: number }
  | { status: 'completed'; url: string }
  | { status: 'error'; message: string }

interface VideoGeneratorProps {
  initialImageUrl?: string | null
}

export default function VideoGenerator({ initialImageUrl }: VideoGeneratorProps) {
  const [mode, setMode] = useState<VideoMode>('text-to-video')
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>(VIDEO_MODELS[0].id)
  const [imagePreview, setImagePreview] = useState<string | null>(initialImageUrl ?? null)
  const [jobState, setJobState] = useState<JobState>({ status: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  const filteredModels = VIDEO_MODELS.filter((m) => m.mode === mode)

  useEffect(() => {
    if (initialImageUrl) {
      setImagePreview(initialImageUrl)
    }
  }, [initialImageUrl])

  useEffect(() => {
    if (filteredModels.length > 0 && !filteredModels.find((m) => m.id === selectedModel)) {
      setSelectedModel(filteredModels[0].id)
    }
  }, [mode, filteredModels, selectedModel])

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const clearImage = () => {
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const pollStatus = async (jobId: string, model: string) => {
    try {
      const status = await getVideoStatus({ data: { jobId, model } })

      if (status.status === 'completed') {
        if (pollingRef.current) clearInterval(pollingRef.current)
        const urlResult = await getVideoUrl({ data: { jobId, model } })
        setJobState({ status: 'completed', url: urlResult.url })
      } else if (status.status === 'processing') {
        setJobState({
          status: 'processing',
          jobId,
          model,
          progress: status.progress,
        })
      } else {
        setJobState({ status: 'pending', jobId, model })
      }
    } catch (err) {
      if (pollingRef.current) clearInterval(pollingRef.current)
      setJobState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to get status',
      })
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    if (mode === 'image-to-video' && !imagePreview) return

    setJobState({ status: 'submitting' })

    try {
      const result = await createVideoJob({
        data: {
          prompt,
          model: selectedModel,
          imageUrl: mode === 'image-to-video' ? imagePreview ?? undefined : undefined,
        },
      })

      setJobState({ status: 'pending', jobId: result.jobId, model: result.model })

      pollingRef.current = setInterval(() => {
        pollStatus(result.jobId, result.model)
      }, 4000)
    } catch (err) {
      setJobState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to create video job',
      })
    }
  }

  const reset = () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    setJobState({ status: 'idle' })
  }

  const isGenerating =
    jobState.status === 'submitting' ||
    jobState.status === 'pending' ||
    jobState.status === 'processing'

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <button
          onClick={() => setMode('text-to-video')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'text-to-video'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Text-to-Video
        </button>
        <button
          onClick={() => setMode('image-to-video')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            mode === 'image-to-video'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Image-to-Video
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isGenerating}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          >
            {filteredModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        {mode === 'image-to-video' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Source Image
            </label>
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Source"
                  className="w-full max-h-64 object-contain rounded-lg border border-gray-700"
                />
                <button
                  onClick={clearImage}
                  disabled={isGenerating}
                  className="absolute top-2 right-2 p-1 bg-gray-900/80 hover:bg-gray-800 rounded-full text-white disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-8 border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-lg text-gray-400 hover:text-gray-300 transition-colors flex flex-col items-center gap-2"
              >
                <Upload className="w-8 h-8" />
                <span>Click to upload an image</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">Prompt</label>
            <button
              onClick={() => setPrompt(getRandomVideoPrompt(mode))}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Shuffle className="w-3.5 h-3.5" />
              Shuffle
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === 'image-to-video'
                ? 'Describe how you want the image to animate...'
                : 'Describe the video you want to generate...'
            }
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={3}
            disabled={isGenerating}
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={
            isGenerating ||
            !prompt.trim() ||
            (mode === 'image-to-video' && !imagePreview)
          }
          className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {jobState.status === 'submitting' && 'Submitting...'}
              {jobState.status === 'pending' && 'Queued...'}
              {jobState.status === 'processing' && (
                <>
                  Processing
                  {'progress' in jobState && jobState.progress != null
                    ? ` (${jobState.progress}%)`
                    : '...'}
                </>
              )}
            </>
          ) : (
            <>
              <Film className="w-5 h-5" />
              Generate Video
            </>
          )}
        </button>
      </div>

      {jobState.status === 'error' && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {jobState.message}
          <button
            onClick={reset}
            className="ml-4 text-sm underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {jobState.status === 'completed' && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white">Generated Video</h3>
          <div className="rounded-lg overflow-hidden border border-gray-700">
            <video
              src={jobState.url}
              controls
              autoPlay
              loop
              className="w-full h-auto"
            />
          </div>
          <button
            onClick={reset}
            className="text-sm text-gray-400 hover:text-white underline"
          >
            Generate another
          </button>
        </div>
      )}
    </div>
  )
}
