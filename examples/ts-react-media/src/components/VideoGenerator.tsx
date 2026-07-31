import { useCallback, useEffect, useRef, useState } from 'react'
import { Film, Loader2, Shuffle, Upload, Wand2, X } from 'lucide-react'
import { useGenerateVideo } from '@tanstack/ai-react'
import type { VideoModel, VideoMode } from '@/lib/models'
import type { AttachedMedia } from '@/lib/media'
import type { MediaPrompt, MediaPromptPart } from '@tanstack/ai/client'
import type { VideoBilling } from '@/lib/billing'

import { generateVideoFn } from '@/lib/server-functions'
import { VIDEO_MODELS } from '@/lib/models'
import { getRandomVideoPrompt } from '@/lib/prompts'
import { imageUrlToPart, readMediaFile, toVideoPart } from '@/lib/media'
import { readVideoBilling } from '@/lib/billing'

interface VideoGeneratorProps {
  initialImageUrl?: string | null
}

/**
 * One submission. Each card builds its own prompt from this, because which
 * parts a model may receive depends on the model: only Omni takes a video
 * part.
 */
interface VideoRequest {
  prompt: string
  mode: VideoMode
  imageUrl: string | null
  video: AttachedMedia | null
}

/** What each card hands the parent so it can drive that card's hook. */
interface VideoCardHandle {
  run: (request: VideoRequest) => void
  clear: () => void
}

/**
 * Image conditioning rides in the prompt: the start frame is an image part
 * tagged `role: 'start_frame'`, which the fal adapter routes to the
 * endpoint's start-image field (e.g. `image_url` on Kling i2v) and Omni takes
 * as an interaction content block. Video parts (a reference clip or a clip to
 * edit) are an Omni capability only, so they never reach the other providers.
 */
function buildVideoPrompt(
  request: VideoRequest,
  model: VideoModel,
): MediaPrompt {
  const parts: Array<MediaPromptPart> = [
    { type: 'text', content: request.prompt },
  ]
  if (request.mode === 'image-to-video' && request.imageUrl) {
    parts.push(imageUrlToPart(request.imageUrl, { role: 'start_frame' }))
  }
  if (request.video && model.provider === 'gemini') {
    parts.push(toVideoPart(request.video))
  }
  return parts.length === 1 ? request.prompt : parts
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
  /** Whether anything has been generated for the current model selection. */
  const [submitted, setSubmitted] = useState(false)
  const [running, setRunning] = useState<Record<string, boolean>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  // Generation is started from the click, not from an effect on the cards:
  // a hook only exists inside a mounted component, so the cards mount with
  // the picker and hand the parent a way to run and clear them.
  const cardsRef = useRef(new Map<string, VideoCardHandle>())

  const filteredModels: ReadonlyArray<VideoModel> = VIDEO_MODELS.filter(
    (m) => m.mode === mode,
  )
  const falModels = filteredModels.filter((m) => m.provider === 'fal')
  const xaiModels = filteredModels.filter((m) => m.provider === 'xai')
  const geminiModels = filteredModels.filter((m) => m.provider === 'gemini')
  const byteplusModels = filteredModels.filter((m) => m.provider === 'byteplus')
  const activeModels =
    selectedModel === 'all'
      ? filteredModels
      : filteredModels.filter((model) => model.id === selectedModel)

  // Gemini Omni Flash additionally accepts video prompt parts (a reference
  // clip or a video to edit). Offer the upload whenever an Omni model is in
  // the running — other providers never receive the video part.
  const omniInRun =
    selectedModel === 'all'
      ? geminiModels.length > 0
      : selectedModel.startsWith('gemini-omni-flash-preview')

  // Each card runs its own generation, so the form is busy while any of them
  // reports that it is.
  const isGenerating = Object.values(running).some(Boolean)

  useEffect(() => {
    if (initialImageUrl) {
      setImagePreview(initialImageUrl)
    }
  }, [initialImageUrl])

  useEffect(() => {
    // When mode changes, reset to "all" or first available model — and with
    // it the results, which belong to the models that produced them.
    setSelectedModel('all')
    setSubmitted(false)
    setRunning({})
  }, [mode])

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

  const handleRunningChange = useCallback((modelId: string, value: boolean) => {
    setRunning((prev) =>
      prev[modelId] === value ? prev : { ...prev, [modelId]: value },
    )
  }, [])

  const registerCard = useCallback(
    (modelId: string, card: VideoCardHandle | null) => {
      if (card) cardsRef.current.set(modelId, card)
      else cardsRef.current.delete(modelId)
    },
    [],
  )

  const handleGenerate = () => {
    if (!prompt.trim()) return
    if (mode === 'image-to-video' && !imagePreview) return

    const request: VideoRequest = {
      prompt,
      mode,
      imageUrl: imagePreview,
      video: attachedVideo,
    }
    setSubmitted(true)
    for (const model of activeModels) {
      cardsRef.current.get(model.id)?.run(request)
    }
  }

  /** "Generate another": drop the results themselves, not just their panel. */
  const clearResults = () => {
    for (const card of cardsRef.current.values()) card.clear()
    setSubmitted(false)
    setRunning({})
  }

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
            onChange={(e) => {
              setSelectedModel(e.target.value)
              setSubmitted(false)
              setRunning({})
            }}
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
            <optgroup label="BytePlus (direct)">
              {byteplusModels.map((model) => (
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
                (optional — Gemini Omni Flash only, clips of 3s or less)
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

      <div className="space-y-6">
        {submitted && (
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-white">
              {activeModels.length > 1 ? 'Generated Videos' : 'Generated Video'}
            </h3>
            {!isGenerating && (
              <button
                onClick={clearResults}
                className="text-sm text-gray-400 hover:text-white underline"
              >
                Generate another
              </button>
            )}
          </div>
        )}
        {activeModels.map((model) => (
          <VideoModelCard
            key={model.id}
            model={model}
            visible={submitted}
            showTitle={activeModels.length > 1}
            onRegister={registerCard}
            onRunningChange={handleRunningChange}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * One model's generation. `useGenerateVideo` drives the whole job lifecycle —
 * the server streams job id, status and the finished url back on one request,
 * so there is no polling timer or job-state machine in the UI.
 */
function VideoModelCard({
  model,
  visible,
  showTitle,
  onRegister,
  onRunningChange,
}: {
  model: VideoModel
  visible: boolean
  showTitle: boolean
  onRegister: (modelId: string, card: VideoCardHandle | null) => void
  onRunningChange: (modelId: string, running: boolean) => void
}) {
  const [editPrompt, setEditPrompt] = useState('')
  const [billing, setBilling] = useState<VideoBilling | undefined>(undefined)
  // The hook builds its client once, so the fetcher closure is created once
  // too: anything that changes between runs (here, the Omni interaction being
  // continued) has to be read from a ref at call time rather than captured.
  const previousInteractionRef = useRef<string | undefined>(undefined)

  const { generate, reset, result, jobId, videoStatus, isLoading, error } =
    useGenerateVideo({
      threadId: `video:${model.id}`,
      // `options.signal` is the hook's abort signal. Forwarding it matters
      // more here than for images: cancelling the response is what ends the
      // server's polling loop instead of leaving it running to the timeout.
      fetcher: (input, options) =>
        generateVideoFn({
          data: {
            prompt: input.prompt,
            model: model.id,
            ...(previousInteractionRef.current
              ? { previousInteractionId: previousInteractionRef.current }
              : {}),
          },
          signal: options?.signal,
        }),
      onChunk: (chunk) => {
        const usage = readVideoBilling(chunk)
        if (usage) setBilling(usage)
      },
    })

  const clear = useCallback(() => {
    previousInteractionRef.current = undefined
    setBilling(undefined)
    reset()
  }, [reset])

  const run = useCallback(
    (request: VideoRequest) => {
      // A new submission is a fresh video, never a continuation of the clip
      // this card is showing. Deliberately not `reset()` first: reset stops
      // the client, which clears the `isLoading` that makes a second
      // `generate()` a no-op — that guard is what swallows a double-click.
      // The stale result a failed re-run leaves behind is handled by the
      // render gate below instead.
      previousInteractionRef.current = undefined
      setBilling(undefined)
      void generate({ prompt: buildVideoPrompt(request, model) })
    },
    [generate, model],
  )

  useEffect(() => {
    onRegister(model.id, { run, clear })
    return () => onRegister(model.id, null)
  }, [model.id, run, clear, onRegister])

  useEffect(() => {
    onRunningChange(model.id, isLoading)
  }, [model.id, isLoading, onRunningChange])

  if (!visible) return null

  /**
   * Gemini Omni Flash conversational editing: chain a new prompt onto the
   * finished generation via its interaction id (the job id). The model
   * applies the change while preserving everything else in the video.
   */
  const handleEditVideo = () => {
    const edit = editPrompt.trim()
    if (!edit || !result || isLoading) return
    previousInteractionRef.current = result.jobId
    setBilling(undefined)
    setEditPrompt('')
    void generate({ prompt: edit })
  }

  const status = videoStatus?.status

  return (
    <div className="space-y-2">
      {showTitle && (
        <h4 className="text-sm font-medium text-gray-300">{model.name}</h4>
      )}
      {isLoading && (
        <div className="flex items-center gap-2 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
          <span className="text-gray-400">
            {!jobId
              ? 'Submitting...'
              : status === 'processing'
                ? `Processing${
                    videoStatus?.progress != null
                      ? ` (${videoStatus.progress}%)`
                      : '...'
                  }`
                : 'Queued...'}
          </span>
        </div>
      )}
      {error && !isLoading && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
          {error.message}
        </div>
      )}
      {/* `!error`: a failed re-run keeps the previous clip on the hook, and it
          must not render underneath the new error. */}
      {result && !isLoading && !error && (
        <>
          <div className="rounded-lg overflow-hidden border border-gray-700">
            <video
              src={result.url}
              controls
              autoPlay
              loop
              className="w-full h-auto"
            />
          </div>
          {billing?.cost != null ? (
            <p className="text-xs text-gray-500">
              Billed ${billing.cost.toFixed(3)}
              {billing.unitsBilled != null
                ? ` for ${billing.unitsBilled} second${billing.unitsBilled === 1 ? '' : 's'} of video`
                : ''}
            </p>
          ) : (
            billing?.unitsBilled != null && (
              <p className="text-xs text-gray-500">
                Billed {billing.unitsBilled} fal unit
                {billing.unitsBilled === 1 ? '' : 's'} — multiply by the
                endpoint unit price for USD cost
              </p>
            )
          )}
          {model.provider === 'gemini' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleEditVideo()
                }}
                placeholder="Describe an edit — e.g. 'make it nighttime'..."
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
              <button
                onClick={handleEditVideo}
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
