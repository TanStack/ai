import { useEffect, useRef, useState } from 'react'
import {
  GitBranch,
  Loader2,
  Music,
  RotateCcw,
  Send,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import type { AttachedMedia } from '@/lib/media'
import type { OmniTaskMode } from '@/lib/models'
import type { MediaPromptPart } from '@tanstack/ai/client'

import {
  createVideoJobFn,
  getVideoStatusFn,
  getVideoUrlFn,
} from '@/lib/server-functions'
import { readMediaFile, toImagePart, toVideoPart } from '@/lib/media'

const OMNI_MODEL = 'gemini-omni-flash-preview'
/** Omni bills per second of generated video. */
const PRICE_PER_SECOND = 0.1
const POLL_INTERVAL_MS = 4000

type AspectRatio = '16:9' | '9:16'

/**
 * One turn of an Omni session: the prompt (plus attachments and generation
 * settings) and the clip it produced. `parentLocalId` records which earlier
 * turn this one continued from — the session is a tree, not a line, since
 * `previousJobId` can point at any prior generation. `duration`
 * is null for edit requests, which follow the source clip's length.
 */
interface OmniTurn {
  localId: string
  prompt: string
  audioHint: string
  images: Array<AttachedMedia>
  video: AttachedMedia | null
  duration: number | null
  aspectRatio: AspectRatio
  task: OmniTaskMode | 'auto'
  parentLocalId: string | null
  status: 'submitting' | 'processing' | 'completed' | 'error'
  jobId?: string
  url?: string
  error?: string
}

const TASK_OPTIONS: Array<{ value: OmniTaskMode | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto (model decides)' },
  { value: 'text_to_video', label: 'Text-to-video' },
  { value: 'image_to_video', label: 'Image-to-video' },
  { value: 'reference_to_video', label: 'Reference-to-video' },
  { value: 'edit', label: 'Edit' },
]

/**
 * Chat-style session view for Gemini Omni Flash. Unlike the one-shot job
 * form in VideoGenerator, every generation here is an interaction you can
 * continue from: sending a new prompt chains it onto the selected clip via
 * `previousJobId`, and "Continue from here" on any earlier clip
 * branches the session from that point.
 */
export default function OmniStudio() {
  const [turns, setTurns] = useState<Array<OmniTurn>>([])
  const [prompt, setPrompt] = useState('')
  const [audioHint, setAudioHint] = useState('')
  const [images, setImages] = useState<Array<AttachedMedia>>([])
  const [video, setVideo] = useState<AttachedMedia | null>(null)
  const [duration, setDuration] = useState(6)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [task, setTask] = useState<OmniTaskMode | 'auto'>('auto')
  /** localId of the turn new prompts continue from; null starts fresh. */
  const [continueFrom, setContinueFrom] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const pollingRefs = useRef<Map<string, NodeJS.Timeout>>(new Map())

  useEffect(() => {
    return () => {
      pollingRefs.current.forEach((interval) => clearInterval(interval))
      pollingRefs.current.clear()
    }
  }, [])

  const updateTurn = (localId: string, patch: Partial<OmniTurn>) => {
    setTurns((prev) =>
      prev.map((turn) =>
        turn.localId === localId ? { ...turn, ...patch } : turn,
      ),
    )
  }

  const stopPolling = (localId: string) => {
    const interval = pollingRefs.current.get(localId)
    if (interval) {
      clearInterval(interval)
      pollingRefs.current.delete(localId)
    }
  }

  const pollTurn = async (localId: string, jobId: string) => {
    try {
      const status = await getVideoStatusFn({
        data: { jobId, model: OMNI_MODEL },
      })
      if (status.status === 'completed') {
        stopPolling(localId)
        const urlResult = await getVideoUrlFn({
          data: { jobId, model: OMNI_MODEL },
        })
        if (!urlResult.url) throw new Error('No URL found')
        updateTurn(localId, { status: 'completed', url: urlResult.url })
        // Conversational default: the newest finished clip becomes the one
        // the next prompt continues from.
        setContinueFrom(localId)
      } else if (status.status === 'failed') {
        stopPolling(localId)
        updateTurn(localId, {
          status: 'error',
          error: status.error ?? 'Video generation failed',
        })
      }
    } catch (err) {
      stopPolling(localId)
      updateTurn(localId, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Failed to get status',
      })
    }
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (imageInputRef.current) imageInputRef.current.value = ''
    if (files.length === 0) return
    try {
      const attached = await Promise.all(files.map(readMediaFile))
      setImages((prev) => [...prev, ...attached])
    } catch {
      // FileReader failures (corrupt/unreadable file) — just drop the batch.
    }
  }

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (videoInputRef.current) videoInputRef.current.value = ''
    if (!file) return
    try {
      setVideo(await readMediaFile(file))
    } catch {
      // Unreadable file — leave the tray unchanged.
    }
  }

  const isBusy = turns.some(
    (turn) => turn.status === 'submitting' || turn.status === 'processing',
  )

  const continueFromTurn = continueFrom
    ? turns.find((turn) => turn.localId === continueFrom)
    : undefined
  const continueFromIndex = continueFromTurn
    ? turns.indexOf(continueFromTurn) + 1
    : null

  // Edits must keep the source clip's length — Omni rejects a mismatched
  // `duration` with a 400 ("Edited video duration ... does not match config
  // duration"). Lock the slider and omit `duration` whenever the request can
  // be an edit: continuing a clip, task pinned to 'edit', or a video
  // attached without pinning 'reference_to_video'.
  const durationLocked =
    continueFrom != null ||
    task === 'edit' ||
    (video != null && task !== 'reference_to_video')

  /**
   * Put a failed turn's inputs back in the composer for adjustment and drop
   * it from the timeline, so resubmitting replaces the failed attempt
   * instead of starting an unrelated fresh generation.
   */
  const restoreTurn = (turn: OmniTurn) => {
    setPrompt(turn.prompt)
    setAudioHint(turn.audioHint)
    setImages(turn.images)
    setVideo(turn.video)
    if (turn.duration != null) setDuration(turn.duration)
    setAspectRatio(turn.aspectRatio)
    setTask(turn.task)
    setContinueFrom(turn.parentLocalId)
    setTurns((prev) => prev.filter((t) => t.localId !== turn.localId))
    promptRef.current?.focus()
  }

  const handleSend = async () => {
    if (!prompt.trim() || isBusy) return

    const parentJobId = continueFromTurn?.jobId
    const localId = crypto.randomUUID()
    const promptText = audioHint.trim()
      ? `${prompt}\n\nAudio: ${audioHint.trim()}`
      : prompt

    const parts: Array<MediaPromptPart> = [
      ...images.map((image) => toImagePart(image)),
      ...(video ? [toVideoPart(video)] : []),
      { type: 'text', content: promptText },
    ]
    const builtPrompt = parts.length === 1 ? promptText : parts

    setTurns((prev) => [
      ...prev,
      {
        localId,
        prompt,
        audioHint,
        images,
        video,
        duration: durationLocked ? null : duration,
        aspectRatio,
        task,
        parentLocalId: parentJobId ? continueFrom : null,
        status: 'submitting',
      },
    ])
    setPrompt('')
    setAudioHint('')
    setImages([])
    setVideo(null)

    try {
      const result = await createVideoJobFn({
        data: {
          prompt: builtPrompt,
          model: OMNI_MODEL,
          ...(parentJobId ? { previousJobId: parentJobId } : {}),
          omniOptions: {
            ...(durationLocked ? {} : { duration }),
            aspectRatio,
            ...(task !== 'auto' ? { task } : {}),
          },
        },
      })
      updateTurn(localId, { status: 'processing', jobId: result.jobId })
      const interval = setInterval(() => {
        pollTurn(localId, result.jobId)
      }, POLL_INTERVAL_MS)
      pollingRefs.current.set(localId, interval)
    } catch (err) {
      updateTurn(localId, {
        status: 'error',
        error:
          err instanceof Error ? err.message : 'Failed to create video job',
      })
    }
  }

  const estimatedCost = (duration * PRICE_PER_SECOND).toFixed(2)

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
        <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-300">
          Every clip here is a conversation turn. Sending another prompt
          continues from the highlighted clip — describe a change and Omni edits
          the video while keeping everything else. Use{' '}
          <span className="text-purple-300">Continue from here</span> on any
          earlier clip to branch the session from that point, or clear the
          banner to start a fresh video.
        </p>
      </div>

      {turns.length > 0 && (
        <div className="space-y-4">
          {turns.map((turn, i) => {
            const parentPosition = turn.parentLocalId
              ? turns.findIndex((t) => t.localId === turn.parentLocalId)
              : -1
            return (
              <div
                key={turn.localId}
                className={`border-l-2 pl-4 space-y-2 ${
                  turn.localId === continueFrom
                    ? 'border-purple-500'
                    : 'border-gray-700'
                }`}
              >
                <div className="p-3 bg-gray-800 rounded-lg border border-gray-700">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <span className="font-medium text-gray-400">
                      Clip #{i + 1}
                    </span>
                    <span>
                      {turn.duration != null
                        ? `${turn.duration}s`
                        : 'source length'}{' '}
                      · {turn.aspectRatio}
                      {turn.task !== 'auto' ? ` · ${turn.task}` : ''}
                    </span>
                    {parentPosition >= 0 && (
                      <span className="flex items-center gap-1 text-purple-400">
                        <GitBranch className="w-3 h-3" />
                        continues #{parentPosition + 1}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-200">{turn.prompt}</p>
                  {turn.audioHint && (
                    <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                      <Music className="w-3 h-3" /> {turn.audioHint}
                    </p>
                  )}
                  {(turn.images.length > 0 || turn.video) && (
                    <div className="flex gap-2 mt-2">
                      {turn.images.map((image) => (
                        <img
                          key={image.id}
                          src={image.dataUrl}
                          alt={image.name}
                          className="w-12 h-12 object-cover rounded border border-gray-600"
                        />
                      ))}
                      {turn.video && (
                        <video
                          src={turn.video.dataUrl}
                          muted
                          className="w-12 h-12 object-cover rounded border border-gray-600"
                        />
                      )}
                    </div>
                  )}
                </div>

                {(turn.status === 'submitting' ||
                  turn.status === 'processing') && (
                  <div className="flex items-center gap-2 p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
                    <span className="text-gray-400">
                      {turn.status === 'submitting'
                        ? 'Submitting...'
                        : 'Generating...'}
                    </span>
                  </div>
                )}
                {turn.status === 'error' && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg space-y-2">
                    <p className="text-red-400 text-sm">{turn.error}</p>
                    <button
                      onClick={() => restoreTurn(turn)}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-red-300 hover:text-red-200 bg-red-500/10 hover:bg-red-500/20 rounded-md transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Edit & retry — restores this prompt and its attachments
                    </button>
                  </div>
                )}
                {turn.status === 'completed' && turn.url && (
                  <div className="space-y-2">
                    <div className="rounded-lg overflow-hidden border border-gray-700">
                      <video
                        src={turn.url}
                        controls
                        autoPlay
                        loop
                        className="w-full h-auto"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-500">
                        {turn.duration != null
                          ? `≈ $${(turn.duration * PRICE_PER_SECOND).toFixed(2)} for ${turn.duration}s of video`
                          : `billed at $${PRICE_PER_SECOND.toFixed(2)}/s of video`}
                      </p>
                      {turn.localId !== continueFrom && (
                        <button
                          onClick={() => {
                            setContinueFrom(turn.localId)
                            promptRef.current?.focus()
                          }}
                          className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded-md transition-colors"
                        >
                          <GitBranch className="w-3.5 h-3.5" />
                          Continue from here
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="space-y-4 p-4 bg-gray-800/60 border border-gray-700 rounded-xl">
        {continueFromIndex != null && (
          <div className="flex items-center justify-between px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <span className="text-sm text-purple-300 flex items-center gap-2">
              <GitBranch className="w-4 h-4" />
              Continuing from clip #{continueFromIndex} — Omni will edit that
              video
            </span>
            <button
              onClick={() => setContinueFrom(null)}
              className="text-xs text-gray-400 hover:text-white underline"
            >
              Start a new video instead
            </button>
          </div>
        )}

        <textarea
          ref={promptRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            continueFromIndex != null
              ? "Describe the change — e.g. 'make it nighttime, add rain'..."
              : 'Describe the video you want to generate...'
          }
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
          rows={3}
        />

        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-gray-500 shrink-0" />
          <input
            type="text"
            value={audioHint}
            onChange={(e) => setAudioHint(e.target.value)}
            placeholder="Audio direction (optional) — e.g. 'calm piano', 'crowd noise, distant thunder'"
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {images.map((image) => (
            <div key={image.id} className="relative">
              <img
                src={image.dataUrl}
                alt={image.name}
                className="w-16 h-16 object-cover rounded-lg border border-gray-600"
              />
              <button
                onClick={() =>
                  setImages((prev) => prev.filter((m) => m.id !== image.id))
                }
                className="absolute -top-1.5 -right-1.5 p-0.5 bg-gray-900 hover:bg-gray-700 rounded-full text-white border border-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {video && (
            <div className="relative">
              <video
                src={video.dataUrl}
                muted
                className="w-16 h-16 object-cover rounded-lg border border-gray-600"
              />
              <button
                onClick={() => setVideo(null)}
                className="absolute -top-1.5 -right-1.5 p-0.5 bg-gray-900 hover:bg-gray-700 rounded-full text-white border border-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex flex-col items-center justify-center w-16 h-16 border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-lg text-gray-500 hover:text-gray-400 transition-colors"
            title="Attach reference images (up to 6)"
          >
            <Upload className="w-4 h-4" />
            <span className="text-[10px] mt-0.5">Images</span>
          </button>
          {!video && (
            <button
              onClick={() => videoInputRef.current?.click()}
              className="flex flex-col items-center justify-center w-16 h-16 border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-lg text-gray-500 hover:text-gray-400 transition-colors"
              title="Attach a reference clip (3 seconds max — longer clips are not processed correctly)"
            >
              <Upload className="w-4 h-4" />
              <span className="text-[10px] mt-0.5">Clip ≤3s</span>
            </button>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handleVideoSelect}
            className="hidden"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {durationLocked ? (
            <span
              className="text-sm text-gray-500"
              title="Omni edits must keep the source clip's length — a mismatched duration is rejected. Pin Task to 'Reference-to-video' to control the length of a clip-conditioned generation."
            >
              Length follows the clip being edited
            </span>
          ) : (
            <label className="flex items-center gap-2 text-sm text-gray-400">
              Duration
              <input
                type="range"
                min={3}
                max={10}
                step={0.5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-28 accent-purple-500"
              />
              <span className="text-gray-300 w-20">
                {duration}s ≈ ${estimatedCost}
              </span>
            </label>
          )}

          <div className="flex gap-1">
            {(['16:9', '9:16'] as const).map((ratio) => (
              <button
                key={ratio}
                onClick={() => setAspectRatio(ratio)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  aspectRatio === ratio
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>

          <select
            value={task}
            onChange={(e) => {
              const value = e.target.value
              const option = TASK_OPTIONS.find((o) => o.value === value)
              if (option) setTask(option.value)
            }}
            className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {TASK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSend}
          disabled={isBusy || !prompt.trim()}
          className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isBusy ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              {continueFromIndex != null
                ? `Continue clip #${continueFromIndex}`
                : 'Generate Video'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
