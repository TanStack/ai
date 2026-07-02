import { useEffect, useRef, useState } from 'react'
import { Film, Loader2, Shuffle, Upload, Wand2, X } from 'lucide-react'
import type { VideoMode } from '@/lib/models'
import type { AttachedMedia } from '@/lib/media'
import type { MediaPromptPart } from '@tanstack/ai/client'

import {
  createVideoJobFn,
  getVideoStatusFn,
  getVideoUrlFn,
} from '@/lib/server-functions'
import { VIDEO_MODELS } from '@/lib/models'
import { getRandomVideoPrompt } from '@/lib/prompts'
import { imageUrlToPart, readMediaFile, toVideoPart } from '@/lib/media'

type JobState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'pending'; jobId: string; model: string }
  | {
      status: 'processing'
      jobId: string
      model: string
      progress?: number | undefined
    }
  | {
      status: 'completed'
      url: string
      jobId: string
      unitsBilled?: number
      cost?: number
    }
  | { status: 'error'; message: string }

interface VideoGeneratorProps {
  initialImageUrl?: string | null
}

export default function VideoGenerator({
  initialImageUrl,
}: VideoGeneratorProps) {
  const [mode, setMode] = useState<VideoMode>('text-to-video')
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState<string>('all')
  const [imagePreview, setImagePreview] = useState<string | null>(
    initialImageUrl ?? null,
  )
  const [attachedVideo, setAttachedVideo] = useState<AttachedMedia | null>(null)
  const [editPrompts, setEditPrompts] = useState<Record<string, string>>({})
  const [jobStates, setJobStates] = useState<Record<string, JobState>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const pollingRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())

  const filteredModels = VIDEO_MODELS.filter((m) => m.mode === mode)
  const falModels = filteredModels.filter((m) => m.provider === 'fal')
  const xaiModels = filteredModels.filter((m) => m.provider === 'xai')
  const geminiModels = filteredModels.filter((m) => m.provider === 'gemini')

  // Gemini Omni Flash additionally accepts video prompt parts (a reference
  // clip or a video to edit). Offer the upload whenever an Omni model is in
  // the running — other providers never receive the video part.
  const omniInRun =
    selectedModel === 'all'
      ? geminiModels.length > 0
      : selectedModel.startsWith('gemini-omni-flash-preview')

  useEffect(() => {
    if (initialImageUrl) {
      setImagePreview(initialImageUrl)
    }
  }, [initialImageUrl])

  useEffect(() => {
    // When mode changes, reset to "all" or first available model
    setSelectedModel('all')
  }, [mode])

  useEffect(() => {
    return () => {
      // Clear all polling intervals on unmount
      pollingRefs.current.forEach((interval) => void clearInterval(interval))
      pollingRefs.current.clear()
    }
  }, [])

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!file) return
    const attached = await readMediaFile(file)
    setImagePreview(attached.dataUrl)
  }

  const clearImage = () => {
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (videoInputRef.current) videoInputRef.current.value = ''
    if (!file) return
    setAttachedVideo(await readMediaFile(file))
  }

  const clearVideo = () => {
    setAttachedVideo(null)
    if (videoInputRef.current) videoInputRef.current.value = ''
  }

  const pollStatus = async (jobId: string, model: string) => {
    try {
      const status = await getVideoStatusFn({ data: { jobId, model } })

      if (status.status === 'completed') {
        const interval = pollingRefs.current.get(model)
        if (interval) {
          clearInterval(interval)
          pollingRefs.current.delete(model)
        }
        const urlResult = await getVideoUrlFn({ data: { jobId, model } })
        if (!urlResult.url) {
          throw new Error('No URL found')
        }
        const url = urlResult.url

        setJobStates((prev) => ({
          ...prev,
          [model]: {
            status: 'completed',
            url: url,
            jobId,
            unitsBilled: urlResult.usage?.unitsBilled,
            cost: urlResult.usage?.cost,
          },
        }))
      } else if (status.status === 'processing') {
        setJobStates((prev) => ({
          ...prev,
          [model]: {
            status: 'processing',
            jobId,
            model,
            progress: status.progress,
          },
        }))
      } else {
        setJobStates((prev) => ({
          ...prev,
          [model]: { status: 'pending', jobId, model },
        }))
      }
    } catch (err) {
      const interval = pollingRefs.current.get(model)
      if (interval) {
        clearInterval(interval)
        pollingRefs.current.delete(model)
      }
      setJobStates((prev) => ({
        ...prev,
        [model]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to get status',
        },
      }))
    }
  }

  // Poll keyed by the UI model id, not result.model: the direct-xAI
  // entries share one adapter model ('grok-imagine-video-1.5'),
  // so result.model wouldn't identify the card (or the adapter) uniquely.
  const beginPolling = (modelId: string, jobId: string) => {
    const interval = setInterval(() => {
      pollStatus(jobId, modelId)
    }, 4000)
    pollingRefs.current.set(modelId, interval)
  }

  const startJobForModel = async (modelId: string) => {
    setJobStates((prev) => ({
      ...prev,
      [modelId]: { status: 'submitting' },
    }))

    try {
      const model = VIDEO_MODELS.find((m) => m.id === modelId)
      const parts: Array<MediaPromptPart> = [{ type: 'text', content: prompt }]
      // Image-to-video sends the start frame as a prompt part — the fal
      // adapter routes `role: 'start_frame'` to the endpoint's start-image
      // field (e.g. `image_url` on Kling i2v); Omni takes it as an
      // interaction content block.
      if (mode === 'image-to-video' && imagePreview) {
        parts.push(imageUrlToPart(imagePreview, { role: 'start_frame' }))
      }
      // Video prompt parts (reference clip / video to edit) are an Omni
      // capability only — never send them to the other providers.
      if (attachedVideo && model?.provider === 'gemini') {
        parts.push(toVideoPart(attachedVideo))
      }
      const builtPrompt = parts.length === 1 ? prompt : parts
      const result = await createVideoJobFn({
        data: {
          prompt: builtPrompt,
          model: modelId,
        },
      })

      setJobStates((prev) => ({
        ...prev,
        [modelId]: {
          status: 'pending',
          jobId: result.jobId,
          model: result.model,
        },
      }))

      beginPolling(modelId, result.jobId)
    } catch (err) {
      setJobStates((prev) => ({
        ...prev,
        [modelId]: {
          status: 'error',
          message:
            err instanceof Error ? err.message : 'Failed to create video job',
        },
      }))
    }
  }

  /**
   * Gemini Omni Flash conversational editing: chain a new prompt onto a
   * completed generation via its interaction id (the jobId). The model
   * applies the change while preserving everything else in the video.
   */
  const handleEditVideo = async (modelId: string, previousJobId: string) => {
    const editPrompt = editPrompts[modelId]?.trim()
    if (!editPrompt) return

    setJobStates((prev) => ({
      ...prev,
      [modelId]: { status: 'submitting' },
    }))

    try {
      const result = await createVideoJobFn({
        data: {
          prompt: editPrompt,
          model: modelId,
          previousInteractionId: previousJobId,
        },
      })

      setJobStates((prev) => ({
        ...prev,
        [modelId]: {
          status: 'pending',
          jobId: result.jobId,
          model: result.model,
        },
      }))
      setEditPrompts((prev) => ({ ...prev, [modelId]: '' }))

      beginPolling(modelId, result.jobId)
    } catch (err) {
      setJobStates((prev) => ({
        ...prev,
        [modelId]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to edit video',
        },
      }))
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    if (mode === 'image-to-video' && !imagePreview) return

    // Clear all existing polling
    pollingRefs.current.forEach((interval) => clearInterval(interval))
    pollingRefs.current.clear()
    setJobStates({})

    if (selectedModel === 'all') {
      // Fire all requests in parallel
      await Promise.all(
        filteredModels.map((model) => startJobForModel(model.id)),
      )
    } else {
      await startJobForModel(selectedModel)
    }
  }

  const reset = () => {
    pollingRefs.current.forEach((interval) => clearInterval(interval))
    pollingRefs.current.clear()
    setJobStates({})
  }

  const isGenerating = Object.values(jobStates).some(
    (state) =>
      state.status === 'submitting' ||
      state.status === 'pending' ||
      state.status === 'processing',
  )

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
            <option value="all">All Models</option>
            <optgroup label="fal.ai">
              {falModels.map((model) => (
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
            <optgroup label="Google (direct)">
              {geminiModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </optgroup>
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

        {omniInRun && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Reference video{' '}
              <span className="text-gray-500 font-normal">
                (optional — Gemini Omni Flash only, short clips)
              </span>
            </label>
            {attachedVideo ? (
              <div className="relative">
                <video
                  src={attachedVideo.dataUrl}
                  controls
                  muted
                  className="w-full max-h-64 rounded-lg border border-gray-700"
                />
                <button
                  onClick={clearVideo}
                  disabled={isGenerating}
                  className="absolute top-2 right-2 p-1 bg-gray-900/80 hover:bg-gray-800 rounded-full text-white disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => videoInputRef.current?.click()}
                className="w-full p-6 border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-lg text-gray-400 hover:text-gray-300 transition-colors flex flex-col items-center gap-2"
              >
                <Upload className="w-6 h-6" />
                <span>Click to attach a video clip</span>
              </button>
            )}
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              onChange={handleVideoSelect}
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
              Generating...
            </>
          ) : (
            <>
              <Film className="w-5 h-5" />
              Generate Video{selectedModel === 'all' ? 's' : ''}
            </>
          )}
        </button>
      </div>

      {Object.keys(jobStates).length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-white">
              {selectedModel === 'all' ? 'Generated Videos' : 'Generated Video'}
            </h3>
            {!isGenerating && (
              <button
                onClick={reset}
                className="text-sm text-gray-400 hover:text-white underline"
              >
                Generate another
              </button>
            )}
          </div>
          {Object.entries(jobStates).map(([modelId, state]) => {
            const model = VIDEO_MODELS.find((m) => m.id === modelId)
            return (
              <div key={modelId} className="space-y-2">
                {selectedModel === 'all' && (
                  <h4 className="text-sm font-medium text-gray-300">
                    {model?.name ?? modelId}
                  </h4>
                )}
                {state.status === 'submitting' && (
                  <div className="flex items-center gap-2 p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                    <span className="text-gray-400">Submitting...</span>
                  </div>
                )}
                {state.status === 'pending' && (
                  <div className="flex items-center gap-2 p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                    <span className="text-gray-400">Queued...</span>
                  </div>
                )}
                {state.status === 'processing' && (
                  <div className="flex items-center gap-2 p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                    <span className="text-gray-400">
                      Processing
                      {state.progress != null ? ` (${state.progress}%)` : '...'}
                    </span>
                  </div>
                )}
                {state.status === 'error' && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
                    {state.message}
                  </div>
                )}
                {state.status === 'completed' && (
                  <>
                    <div className="rounded-lg overflow-hidden border border-gray-700">
                      <video
                        src={state.url}
                        controls
                        autoPlay
                        loop
                        className="w-full h-auto"
                      />
                    </div>
                    {state.cost != null ? (
                      <p className="text-xs text-gray-500">
                        Billed ${state.cost.toFixed(3)}
                        {state.unitsBilled != null
                          ? ` for ${state.unitsBilled} second${state.unitsBilled === 1 ? '' : 's'} of video`
                          : ''}
                      </p>
                    ) : (
                      state.unitsBilled != null && (
                        <p className="text-xs text-gray-500">
                          Billed {state.unitsBilled} fal unit
                          {state.unitsBilled === 1 ? '' : 's'} — multiply by the
                          endpoint unit price for USD cost
                        </p>
                      )
                    )}
                    {model?.provider === 'gemini' && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editPrompts[modelId] ?? ''}
                          onChange={(e) =>
                            setEditPrompts((prev) => ({
                              ...prev,
                              [modelId]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')
                              handleEditVideo(modelId, state.jobId)
                          }}
                          placeholder="Describe an edit — e.g. 'make it nighttime'..."
                          disabled={isGenerating}
                          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                        />
                        <button
                          onClick={() => handleEditVideo(modelId, state.jobId)}
                          disabled={
                            isGenerating || !editPrompts[modelId]?.trim()
                          }
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
          })}
        </div>
      )}
    </div>
  )
}
