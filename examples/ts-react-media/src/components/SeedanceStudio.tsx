import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  Dices,
  Download,
  Film,
  Loader2,
  Shuffle,
  Upload,
  X,
} from 'lucide-react'
import type {
  BytePlusVideoModel,
  BytePlusVideoModelOrString,
  BytePlusVideoRatio,
  BytePlusVideoResolution,
} from '@tanstack/ai-byteplus'
import type { TokenUsage } from '@tanstack/ai'
import type { MediaPromptPart } from '@tanstack/ai/client'
import type { AttachedMedia } from '@/lib/media'
import type {
  SeedanceCapability,
  SeedanceInputMode,
  SeedanceJobOptions,
  SeedanceModelEntry,
} from '@/lib/seedance'

import { createSeedanceJobFn, getSeedanceJobFn } from '@/lib/server-functions'
import { readMediaFile, toImagePart } from '@/lib/media'
import { getRandomVideoPrompt } from '@/lib/prompts'
import {
  SEEDANCE_CUSTOM_MODEL_PLACEHOLDER,
  SEEDANCE_FPS,
  SEEDANCE_MAX_FRAMES,
  SEEDANCE_MIN_FRAMES,
  SEEDANCE_MODELS,
  SEEDANCE_RATIOS,
  SEEDANCE_RESOLUTION_TIERS,
  SEEDANCE_UNKNOWN_MODEL_EXTRAS,
  describeSeedanceModel,
  seedanceModel,
  snapSeedanceFrames,
} from '@/lib/seedance'

const POLL_INTERVAL_MS = 5000
/**
 * Consecutive failed polls tolerated before the job is called failed. A flex
 * task can sit queued for many minutes, so a single blip on the way to the
 * status endpoint should not throw away a job that is still running.
 */
const MAX_POLL_FAILURES = 3
/** How many reference images the studio offers on the 2.0 family. */
const MAX_REFERENCE_IMAGES = 4
/** Documented seed range; `-1` leaves generation unseeded. */
const MIN_SEED = -1
const MAX_SEED = 2 ** 32 - 1

/** What was actually requested, kept alongside the job for the result panel. */
interface JobSettings {
  model: BytePlusVideoModelOrString
  ratio: BytePlusVideoRatio
  /** A tier this package knows, or whatever a custom model was asked for. */
  resolution: string
  /** Seconds, `-1` for model-chosen, or null when a frame count was sent. */
  duration: number | null
  frames: number | null
  seed: number | null
  serviceTier: 'default' | 'flex' | null
}

type JobState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | {
      status: 'pending' | 'processing'
      jobId: string
      startedAt: number
      settings: JobSettings
    }
  | {
      status: 'completed'
      jobId: string
      startedAt: number
      finishedAt: number
      settings: JobSettings
      url: string
      expiresAt?: string
      usage?: TokenUsage
    }
  | { status: 'error'; message: string }

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

/**
 * Direct BytePlus Seedance studio: one model at a time, with every control
 * gated on what that model actually accepts.
 *
 * The gating is not cosmetic. Ark rejects an inapplicable field outright
 * ("the specified parameter `draft` is not supported for model
 * seedance-1-0-pro …") and sorts prompt media into mutually exclusive task
 * types, so a form that let you mix a reference image into a first-and-last
 * frame request, or send `priority` to a 1.x model, would only ever produce a
 * 400. The capability half of the gating (`capabilities`) is read out of the
 * adapter package on the server; the option-applicability half comes from
 * `SEEDANCE_MODELS`.
 */
export default function SeedanceStudio({
  capabilities,
}: {
  capabilities: Array<SeedanceCapability>
}) {
  const [modelId, setModelId] = useState<BytePlusVideoModel>(
    'dreamina-seedance-2-0-260128',
  )
  const [prompt, setPrompt] = useState('')
  const [inputMode, setInputMode] = useState<SeedanceInputMode>('text')
  const [firstFrame, setFirstFrame] = useState<AttachedMedia | null>(null)
  const [lastFrame, setLastFrame] = useState<AttachedMedia | null>(null)
  const [references, setReferences] = useState<Array<AttachedMedia>>([])

  const [ratio, setRatio] = useState<BytePlusVideoRatio>('16:9')
  const [resolution, setResolution] = useState<BytePlusVideoResolution>('720p')
  const [duration, setDuration] = useState(5)
  const [autoDuration, setAutoDuration] = useState(false)
  const [useFrames, setUseFrames] = useState(false)
  const [frames, setFrames] = useState(121)

  // Advanced escape hatch: a model id this package has no metadata for.
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [customModelId, setCustomModelId] = useState('')
  const [customResolution, setCustomResolution] = useState('')

  const [seed, setSeed] = useState('')
  const [watermark, setWatermark] = useState(false)
  const [generateAudio, setGenerateAudio] = useState(false)
  const [cameraFixed, setCameraFixed] = useState(false)
  const [flexTier, setFlexTier] = useState(false)
  const [draft, setDraft] = useState(false)
  const [priority, setPriority] = useState(5)

  const [job, setJob] = useState<JobState>({ status: 'idle' })
  const [now, setNow] = useState(() => Date.now())

  const firstFrameInputRef = useRef<HTMLInputElement>(null)
  const lastFrameInputRef = useRef<HTMLInputElement>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const pollFailuresRef = useRef(0)

  // A non-empty custom id switches the studio into unknown-model mode: the
  // adapter's per-model guards are off for an id it has no table for, so the
  // full option surface is offered and Ark judges the request.
  const customModel = customModelId.trim()
  const usingCustomId = showAdvanced && customModel.length > 0
  const activeModel: BytePlusVideoModelOrString = usingCustomId
    ? customModel
    : modelId

  // A catalog miss takes the same path as a custom id rather than borrowing
  // another model's option policy. It cannot happen while
  // `SeedanceCatalogCoversEveryModel` compiles, which is the point.
  const catalogEntry = usingCustomId ? undefined : seedanceModel(modelId)
  const unknownMode = catalogEntry === undefined
  const entry: SeedanceModelEntry = catalogEntry ?? {
    id: activeModel,
    name: activeModel,
    blurb: 'Custom model id — capabilities unverified',
    extras: SEEDANCE_UNKNOWN_MODEL_EXTRAS,
  }
  const capability = unknownMode
    ? undefined
    : capabilities.find((c) => c.model === modelId)
  const resolutions = unknownMode
    ? SEEDANCE_RESOLUTION_TIERS
    : (capability?.resolutions ?? [])
  const durationRange = capability?.duration ?? { min: 4, max: 12, step: 1 }
  const canLastFrame = unknownMode || (capability?.supportsLastFrame ?? false)
  const canReference =
    unknownMode || (capability?.supportsReferenceMedia ?? false)

  // Everything below clamps the raw control state to the selected model rather
  // than rewriting it on change, so switching models to compare and switching
  // back leaves your settings where you left them.
  const effectiveMode: SeedanceInputMode =
    (inputMode === 'first-last-frame' && !canLastFrame) ||
    (inputMode === 'reference' && !canReference)
      ? 'text'
      : inputMode
  const effectiveResolution = resolutions.includes(resolution)
    ? resolution
    : (resolutions[resolutions.length - 1] ?? '720p')
  // A custom tier wins over the picker: a future model may bring one that does
  // not exist today, which is the whole point of the free-text field.
  const requestResolution: string =
    unknownMode && customResolution.trim().length > 0
      ? customResolution.trim()
      : effectiveResolution
  // An unknown model's duration is sent verbatim (the adapter deliberately
  // does not snap it), so the input is free rather than clamped to a range
  // borrowed from the models that happen to exist today.
  const effectiveDuration = unknownMode
    ? duration
    : Math.min(durationRange.max, Math.max(durationRange.min, duration))
  const effectiveFrames = snapSeedanceFrames(frames)
  const framesActive = entry.extras.frames && useFrames
  const autoDurationActive = entry.extras.autoDuration && autoDuration
  const hasImageInput = effectiveMode !== 'text'
  // `adaptive` follows the input frame, so it is only meaningful — and on the
  // 1.0 models only accepted — once an image is attached.
  const effectiveRatio: BytePlusVideoRatio =
    ratio === 'adaptive' && !hasImageInput ? '16:9' : ratio

  const isBusy =
    job.status === 'submitting' ||
    job.status === 'pending' ||
    job.status === 'processing'

  const stopPolling = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
    pollFailuresRef.current = 0
  }

  useEffect(() => stopPolling, [])

  // Drive the elapsed-time readout; flex tasks can sit queued for many
  // minutes, so the wait needs to look like progress.
  useEffect(() => {
    if (!isBusy) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [isBusy])

  const attachFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
    apply: (media: AttachedMedia) => void,
  ) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      apply(await readMediaFile(file))
    } catch {
      // Unreadable file — leave the current attachment in place.
    }
  }

  /** Queue the next poll. Self-scheduling, so a slow status call can never
   *  stack up behind the previous one the way a fixed interval would. */
  const schedulePoll = (jobId: string, model: BytePlusVideoModelOrString) => {
    pollRef.current = setTimeout(() => {
      pollJob(jobId, model)
    }, POLL_INTERVAL_MS)
  }

  // The model is threaded through rather than read from state: a poll must
  // keep asking about the model the job was submitted with, even if the picker
  // or the custom id has moved on since.
  const pollJob = async (jobId: string, model: BytePlusVideoModelOrString) => {
    try {
      const result = await getSeedanceJobFn({ data: { jobId, model } })
      const { url, expiresAt, usage } = result
      pollFailuresRef.current = 0
      if (result.status === 'completed' && url) {
        stopPolling()
        setJob((prev) =>
          prev.status === 'pending' || prev.status === 'processing'
            ? {
                status: 'completed',
                jobId,
                startedAt: prev.startedAt,
                finishedAt: Date.now(),
                settings: prev.settings,
                url,
                ...(expiresAt !== undefined && { expiresAt }),
                ...(usage && { usage }),
              }
            : prev,
        )
      } else if (result.status === 'failed') {
        // A terminal state from the provider, as opposed to a failed poll:
        // this one is the job's own verdict and gets no retries.
        stopPolling()
        setJob({
          status: 'error',
          message: result.error ?? 'Video generation failed',
        })
      } else {
        const status = result.status === 'pending' ? 'pending' : 'processing'
        setJob((prev) =>
          prev.status === 'pending' || prev.status === 'processing'
            ? { ...prev, status }
            : prev,
        )
        schedulePoll(jobId, model)
      }
    } catch (err) {
      // The status call itself failed. The job is very likely still running —
      // a flex task can be queued for many minutes — so ride out a few blips
      // before declaring it dead.
      pollFailuresRef.current += 1
      if (pollFailuresRef.current < MAX_POLL_FAILURES) {
        schedulePoll(jobId, model)
        return
      }
      stopPolling()
      setJob({
        status: 'error',
        message:
          err instanceof Error
            ? `${err.message} (after ${MAX_POLL_FAILURES} consecutive failed status checks)`
            : 'Failed to get status',
      })
    }
  }

  const handleGenerate = async () => {
    if (!prompt.trim() && !hasImageInput) return
    stopPolling()
    setJob({ status: 'submitting' })

    const parts: Array<MediaPromptPart> = []
    if (prompt.trim()) parts.push({ type: 'text', content: prompt })
    if (
      effectiveMode === 'first-frame' ||
      effectiveMode === 'first-last-frame'
    ) {
      if (firstFrame)
        parts.push(toImagePart(firstFrame, { role: 'start_frame' }))
      if (effectiveMode === 'first-last-frame' && lastFrame) {
        parts.push(toImagePart(lastFrame, { role: 'end_frame' }))
      }
    }
    if (effectiveMode === 'reference') {
      for (const reference of references) {
        parts.push(toImagePart(reference, { role: 'reference' }))
      }
    }

    // Clamped as well as bounded on the input: a number field still accepts
    // out-of-range values typed or pasted straight in, and Ark rejects a seed
    // outside `[-1, 2^32-1]`.
    const parsedSeed = seed.trim() === '' ? null : Number(seed)
    const seedValue =
      parsedSeed !== null && Number.isFinite(parsedSeed)
        ? Math.min(MAX_SEED, Math.max(MIN_SEED, Math.trunc(parsedSeed)))
        : null

    const settings: JobSettings = {
      model: activeModel,
      ratio: effectiveRatio,
      resolution: requestResolution,
      duration: framesActive
        ? null
        : autoDurationActive
          ? -1
          : effectiveDuration,
      frames: framesActive ? effectiveFrames : null,
      seed: seedValue,
      serviceTier: entry.extras.serviceTier
        ? flexTier
          ? 'flex'
          : 'default'
        : null,
    }

    // Only fields the selected model accepts go on the wire — Ark 400s on the
    // rest rather than ignoring them. A custom id accepts everything, and its
    // sizing goes through the open `size` template because `resolution` is
    // typed against the tiers this package knows.
    const options: SeedanceJobOptions = {
      ...(unknownMode
        ? { size: `${effectiveRatio}_${requestResolution}` }
        : { ratio: effectiveRatio, resolution: effectiveResolution }),
      ...(framesActive
        ? { frames: effectiveFrames }
        : { duration: autoDurationActive ? -1 : effectiveDuration }),
      ...(seedValue !== null && { seed: seedValue }),
      watermark,
      ...(entry.extras.generateAudio && { generateAudio }),
      ...(entry.extras.cameraFixed && { cameraFixed }),
      ...(entry.extras.serviceTier && {
        serviceTier: flexTier ? 'flex' : 'default',
      }),
      ...(entry.extras.draft && { draft }),
      ...(entry.extras.priority && { priority }),
    }

    try {
      const result = await createSeedanceJobFn({
        data: {
          prompt: parts.length === 1 && !hasImageInput ? prompt : parts,
          model: activeModel,
          options,
        },
      })
      setJob({
        status: 'pending',
        jobId: result.jobId,
        startedAt: Date.now(),
        settings,
      })
      schedulePoll(result.jobId, activeModel)
    } catch (err) {
      setJob({
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Failed to create video job',
      })
    }
  }

  const modeOptions: Array<{
    value: SeedanceInputMode
    label: string
    enabled: boolean
    hint: string
  }> = [
    { value: 'text', label: 'Text only', enabled: true, hint: 'Text-to-video' },
    {
      value: 'first-frame',
      label: 'First frame',
      enabled: true,
      hint: 'Animate an opening frame',
    },
    {
      value: 'first-last-frame',
      label: 'First + last frame',
      enabled: canLastFrame,
      hint: canLastFrame
        ? 'Pin both ends of the shot'
        : 'This model has no closing-frame mode',
    },
    {
      value: 'reference',
      label: 'Reference images',
      enabled: canReference,
      hint: canReference
        ? 'Subject and style references (Seedance 2.0)'
        : 'Reference media is Seedance 2.0 only',
    },
  ]

  const modelCardsDisabled = isBusy || unknownMode

  const readyToGenerate =
    (prompt.trim().length > 0 || hasImageInput) &&
    (effectiveMode !== 'first-frame' || firstFrame !== null) &&
    (effectiveMode !== 'first-last-frame' ||
      (firstFrame !== null && lastFrame !== null)) &&
    (effectiveMode !== 'reference' || references.length > 0)

  return (
    <div className="space-y-6">
      <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-medium text-white">Model</h2>
          <p className="text-sm text-gray-400">
            Each model exposes a different slice of the Seedance request — the
            controls below follow the one you pick.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {SEEDANCE_MODELS.map((model) => {
            const selected = !unknownMode && model.id === modelId
            return (
              <button
                key={model.id}
                onClick={() => setModelId(model.id)}
                disabled={modelCardsDisabled}
                className={`text-left p-4 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  selected
                    ? 'bg-blue-600/15 border-blue-500'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="font-medium text-white">{model.name}</div>
                <div className="text-xs text-gray-500 font-mono mt-0.5">
                  {model.id}
                </div>
                <div className="text-xs text-cyan-300 mt-2">
                  {describeSeedanceModel(
                    model,
                    capabilities.find((c) => c.model === model.id),
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">{model.blurb}</div>
              </button>
            )
          })}
        </div>

        <div className="pt-2 border-t border-gray-700">
          <button
            onClick={() => setShowAdvanced((prev) => !prev)}
            disabled={isBusy}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
          >
            {showAdvanced ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Advanced: custom model id
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3">
              <input
                type="text"
                value={customModelId}
                onChange={(e) => setCustomModelId(e.target.value)}
                placeholder={SEEDANCE_CUSTOM_MODEL_PLACEHOLDER}
                disabled={isBusy}
                spellCheck={false}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm font-mono text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:opacity-50"
              />
              <p className="text-xs text-gray-500">
                For a Seedance model BytePlus ships between releases of{' '}
                <code className="text-gray-400">@tanstack/ai-byteplus</code>.
                Leave it empty to go back to the picker.
              </p>
              {unknownMode && (
                <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200/90">
                    Capabilities unverified — every option below is enabled and
                    the API validates the request, because the adapter switches
                    its per-model guards off for an id it has no table for.
                    Seedance 2.5 additionally requires activation in the Ark
                    Console; without it the task returns 404{' '}
                    <code className="text-amber-300">ModelNotOpen</code>.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-white">Prompt</h2>
          <button
            onClick={() =>
              setPrompt(
                getRandomVideoPrompt(
                  hasImageInput ? 'image-to-video' : 'text-to-video',
                ),
              )
            }
            disabled={isBusy}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-md transition-colors disabled:opacity-50"
          >
            <Shuffle className="w-3.5 h-3.5" />
            Shuffle
          </button>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the shot — quote any dialogue you want in the audio track..."
          rows={3}
          disabled={isBusy}
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50"
        />

        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            Image conditioning
          </h3>
          <div className="flex flex-wrap gap-2">
            {modeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setInputMode(option.value)}
                disabled={isBusy || !option.enabled}
                title={option.hint}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  effectiveMode === option.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {/* Images only: the Seedance 2.0 family also takes reference video
              and audio, which this studio deliberately leaves out of scope. */}
          <p className="text-xs text-gray-500 mt-2">
            Frame roles and reference roles are mutually exclusive modes on
            Seedance, so the studio sends one or the other — never a mix.
          </p>
        </div>

        {(effectiveMode === 'first-frame' ||
          effectiveMode === 'first-last-frame') && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FramePicker
              label="First frame"
              media={firstFrame}
              disabled={isBusy}
              onPick={() => firstFrameInputRef.current?.click()}
              onClear={() => setFirstFrame(null)}
            />
            {effectiveMode === 'first-last-frame' && (
              <FramePicker
                label="Last frame"
                media={lastFrame}
                disabled={isBusy}
                onPick={() => lastFrameInputRef.current?.click()}
                onClear={() => setLastFrame(null)}
              />
            )}
          </div>
        )}

        {effectiveMode === 'reference' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Reference images{' '}
              <span className="text-gray-500 font-normal">
                (subject and style, up to {MAX_REFERENCE_IMAGES})
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {references.map((reference) => (
                <div key={reference.id} className="relative">
                  <img
                    src={reference.dataUrl}
                    alt={reference.name}
                    className="w-20 h-20 object-cover rounded-lg border border-gray-600"
                  />
                  <button
                    onClick={() =>
                      setReferences((prev) =>
                        prev.filter((m) => m.id !== reference.id),
                      )
                    }
                    disabled={isBusy}
                    className="absolute -top-1.5 -right-1.5 p-0.5 bg-gray-900 hover:bg-gray-700 rounded-full text-white border border-gray-600 disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {references.length < MAX_REFERENCE_IMAGES && (
                <button
                  onClick={() => referenceInputRef.current?.click()}
                  disabled={isBusy}
                  className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-lg text-gray-500 hover:text-gray-400 transition-colors disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />
                  <span className="text-[10px] mt-0.5">Add</span>
                </button>
              )}
            </div>
          </div>
        )}

        <input
          ref={firstFrameInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => attachFile(e, setFirstFrame)}
        />
        <input
          ref={lastFrameInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => attachFile(e, setLastFrame)}
        />
        <input
          ref={referenceInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) =>
            attachFile(e, (media) =>
              setReferences((prev) =>
                [...prev, media].slice(0, MAX_REFERENCE_IMAGES),
              ),
            )
          }
        />
      </section>

      <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-5">
        <h2 className="text-lg font-medium text-white">Output</h2>

        <Control label="Aspect ratio">
          <div className="flex flex-wrap gap-1">
            {SEEDANCE_RATIOS.map((option) => (
              <ChoiceButton
                key={option}
                selected={effectiveRatio === option}
                disabled={isBusy}
                onClick={() => setRatio(option)}
              >
                {option}
              </ChoiceButton>
            ))}
            {hasImageInput && (
              <ChoiceButton
                selected={effectiveRatio === 'adaptive'}
                disabled={isBusy}
                onClick={() => setRatio('adaptive')}
              >
                adaptive
              </ChoiceButton>
            )}
          </div>
        </Control>

        <Control
          label="Resolution"
          hint={
            unknownMode
              ? `sent as "${effectiveRatio}_${requestResolution}" — tiers this package knows, or type your own`
              : `${entry.name} accepts ${resolutions.join(', ')}`
          }
        >
          <div className="flex flex-wrap items-center gap-1">
            {resolutions.map((option) => (
              <ChoiceButton
                key={option}
                selected={
                  requestResolution === option && effectiveResolution === option
                }
                disabled={isBusy}
                onClick={() => {
                  setResolution(option)
                  setCustomResolution('')
                }}
              >
                {option}
              </ChoiceButton>
            ))}
            {unknownMode && (
              <input
                type="text"
                value={customResolution}
                onChange={(e) => setCustomResolution(e.target.value)}
                placeholder="custom tier"
                disabled={isBusy}
                spellCheck={false}
                className="w-32 px-3 py-1 bg-gray-800 border border-gray-700 rounded-md text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
              />
            )}
          </div>
        </Control>

        <Control
          label="Length"
          hint={
            framesActive
              ? `${effectiveFrames} frames ≈ ${(effectiveFrames / SEEDANCE_FPS).toFixed(2)}s at ${SEEDANCE_FPS} fps`
              : unknownMode
                ? 'whole seconds, sent verbatim — no range is assumed for a model this package has no table for'
                : `${durationRange.min}-${durationRange.max}s, whole seconds`
          }
        >
          <div className="space-y-2">
            {framesActive ? (
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={SEEDANCE_MIN_FRAMES}
                  max={SEEDANCE_MAX_FRAMES}
                  step={4}
                  value={effectiveFrames}
                  disabled={isBusy}
                  onChange={(e) => setFrames(Number(e.target.value))}
                  className="w-48 accent-blue-500"
                />
                <span className="text-sm text-gray-300 w-24">
                  {effectiveFrames} frames
                </span>
              </div>
            ) : unknownMode ? (
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={effectiveDuration}
                  disabled={isBusy || autoDurationActive}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-28 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
                />
                <span className="text-sm text-gray-300">
                  {autoDurationActive ? 'model picks' : 'seconds'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={durationRange.min}
                  max={durationRange.max}
                  step={durationRange.step}
                  value={effectiveDuration}
                  disabled={isBusy || autoDurationActive}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-48 accent-blue-500 disabled:opacity-50"
                />
                <span className="text-sm text-gray-300 w-24">
                  {autoDurationActive ? 'model picks' : `${effectiveDuration}s`}
                </span>
              </div>
            )}
            <div className="flex flex-wrap gap-4">
              {entry.extras.autoDuration && (
                <Toggle
                  label="Let the model choose the length"
                  hint="Sends duration: -1 (Seedance 2.0 and 1.5-pro only)"
                  checked={autoDurationActive}
                  // No catalog model offers both a frame count and a
                  // model-chosen length, but a custom id offers everything —
                  // and `frames` wins over `duration` server-side, so the two
                  // must not read as simultaneously on.
                  disabled={isBusy || framesActive}
                  onChange={setAutoDuration}
                />
              )}
              {entry.extras.frames && (
                <Toggle
                  label="Use a frame count instead"
                  hint={`Fractional-second output on the 25 + 4n grid, ${SEEDANCE_FPS} fps`}
                  checked={framesActive}
                  disabled={isBusy}
                  onChange={setUseFrames}
                />
              )}
            </div>
          </div>
        </Control>

        <Control label="Seed" hint="-1 or empty leaves generation unseeded">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={MIN_SEED}
              max={MAX_SEED}
              step={1}
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="unseeded"
              disabled={isBusy}
              className="w-40 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
            <button
              onClick={() =>
                setSeed(String(Math.floor(Math.random() * 2 ** 32)))
              }
              disabled={isBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-md transition-colors disabled:opacity-50"
            >
              <Dices className="w-3.5 h-3.5" />
              Random
            </button>
          </div>
        </Control>

        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-gray-700">
          <Toggle
            label="Watermark"
            hint="Burn a watermark into the output"
            checked={watermark}
            disabled={isBusy}
            onChange={setWatermark}
          />
          {/* No `return_last_frame` control: its PNG comes back on the task as
              `content.last_frame_url`, which neither the adapter's
              `getVideoUrl` nor core's `VideoUrlResult` carries, so the studio
              could offer the toggle but never show you the frame. */}
          {entry.extras.generateAudio && (
            <Toggle
              label="Generate audio"
              hint="Dialogue, effects and score inferred from the prompt"
              checked={generateAudio}
              disabled={isBusy}
              onChange={setGenerateAudio}
            />
          )}
          {entry.extras.cameraFixed && (
            <Toggle
              label="Fixed camera"
              hint="Best-effort 'hold the camera still' instruction (Seedance 1.x)"
              checked={cameraFixed}
              disabled={isBusy}
              onChange={setCameraFixed}
            />
          )}
          {entry.extras.serviceTier && (
            <Toggle
              label="Flex tier"
              hint="Offline batch queue: half price, no latency guarantee — expect a long wait"
              checked={flexTier}
              disabled={isBusy}
              onChange={setFlexTier}
            />
          )}
          {entry.extras.draft && (
            <Toggle
              label="Draft render"
              hint="Cheap low-fidelity preview to check staging (Seedance 1.5-pro)"
              checked={draft}
              disabled={isBusy}
              onChange={setDraft}
            />
          )}
        </div>

        {entry.extras.priority && (
          <Control label="Queue priority" hint="0-9, Seedance 2.0 family only">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={9}
                step={1}
                value={priority}
                disabled={isBusy}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-48 accent-blue-500"
              />
              <span className="text-sm text-gray-300 w-8">{priority}</span>
            </div>
          </Control>
        )}
      </section>

      <button
        onClick={handleGenerate}
        disabled={isBusy || !readyToGenerate}
        className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
      >
        {isBusy ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Film className="w-5 h-5" />
            Generate with {entry.name}
          </>
        )}
      </button>

      {job.status !== 'idle' && (
        <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-4">
          {job.status === 'submitting' && (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              Submitting the task...
            </div>
          )}

          {(job.status === 'pending' || job.status === 'processing') && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-gray-300">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                <span className="font-medium">
                  {job.status === 'pending' ? 'Queued' : 'Processing'}
                </span>
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <Clock className="w-3.5 h-3.5" />
                  {formatElapsed(now - job.startedAt)}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono">{job.jobId}</p>
              {job.settings.serviceTier === 'flex' && (
                <p className="text-xs text-amber-400/80">
                  Flex is the offline batch queue — tasks routinely sit here for
                  many minutes before they start.
                </p>
              )}
            </div>
          )}

          {job.status === 'error' && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {job.message}
            </div>
          )}

          {job.status === 'completed' && (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border border-gray-700">
                <video
                  src={job.url}
                  controls
                  autoPlay
                  loop
                  className="w-full h-auto"
                />
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                <Meta label="Model" value={job.settings.model} />
                <Meta
                  label="Output"
                  value={`${job.settings.ratio} · ${job.settings.resolution}`}
                />
                <Meta
                  label="Length"
                  value={
                    job.settings.frames !== null
                      ? `${job.settings.frames} frames @ ${SEEDANCE_FPS} fps`
                      : job.settings.duration === -1
                        ? 'model-chosen'
                        : `${job.settings.duration}s`
                  }
                />
                <Meta
                  label="Seed"
                  value={
                    job.settings.seed === null || job.settings.seed === -1
                      ? 'unseeded'
                      : String(job.settings.seed)
                  }
                />
                {job.settings.serviceTier && (
                  <Meta label="Tier" value={job.settings.serviceTier} />
                )}
                <Meta
                  label="Wall clock"
                  value={formatElapsed(job.finishedAt - job.startedAt)}
                />
                {job.usage && (
                  <Meta
                    label="Billed tokens"
                    value={`${job.usage.unitsBilled ?? job.usage.totalTokens}`}
                  />
                )}
              </dl>
              <div className="flex items-center justify-between gap-4">
                <a
                  href={job.url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-md transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
                <p className="text-xs text-amber-400/80 text-right">
                  BytePlus deletes this URL 24 hours after the task finishes
                  {job.expiresAt
                    ? ` — ${new Date(job.expiresAt).toLocaleString()}`
                    : ''}
                  . Download anything you want to keep.
                </p>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Control({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium text-gray-300">{label}</span>
        {hint && <span className="text-xs text-gray-500">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function ChoiceButton({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1 text-sm rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        selected
          ? 'bg-blue-600 text-white'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
      }`}
    >
      {children}
    </button>
  )
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label
      title={hint}
      className={`flex items-start gap-2 text-sm ${
        disabled ? 'opacity-50' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-blue-500"
      />
      <span>
        <span className="text-gray-300">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </label>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-300 break-all">{value}</dd>
    </div>
  )
}

function FramePicker({
  label,
  media,
  disabled,
  onPick,
  onClear,
}: {
  label: string
  media: AttachedMedia | null
  disabled: boolean
  onPick: () => void
  onClear: () => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        {label}
      </label>
      {media ? (
        <div className="relative">
          <img
            src={media.dataUrl}
            alt={label}
            className="w-full max-h-48 object-contain rounded-lg border border-gray-700"
          />
          <button
            onClick={onClear}
            disabled={disabled}
            className="absolute top-2 right-2 p-1 bg-gray-900/80 hover:bg-gray-800 rounded-full text-white disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={onPick}
          disabled={disabled}
          className="w-full p-6 border-2 border-dashed border-gray-600 hover:border-gray-500 rounded-lg text-gray-400 hover:text-gray-300 transition-colors flex flex-col items-center gap-2 disabled:opacity-50"
        >
          <Upload className="w-6 h-6" />
          <span className="text-sm">Upload an image</span>
        </button>
      )}
    </div>
  )
}
