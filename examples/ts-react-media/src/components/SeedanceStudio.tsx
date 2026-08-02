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
  Music,
  Play,
  Shuffle,
  Upload,
  X,
} from 'lucide-react'
import { useGenerateVideo } from '@tanstack/ai-react'
import type {
  BytePlusVideoModel,
  BytePlusVideoModelOrString,
  BytePlusVideoRatio,
  BytePlusVideoResolution,
} from '@tanstack/ai-byteplus'
import type { MediaPromptPart } from '@tanstack/ai/client'
import type { AttachedMedia } from '@/lib/media'
import type {
  SeedanceTemplate,
  SeedanceTemplateMedia,
} from '@/lib/seedance-templates'
import type { VideoBilling } from '@/lib/billing'
import type {
  SeedanceCapability,
  SeedanceInputMode,
  SeedanceJobOptions,
  SeedanceModelEntry,
} from '@/lib/seedance'

import { generateSeedanceVideoFn } from '@/lib/server-functions'
import { mediaUrlToPart, readMediaFile, toImagePart } from '@/lib/media'
import { readVideoBilling } from '@/lib/billing'
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
import {
  SEEDANCE_TEMPLATES,
  SEEDANCE_TEMPLATE_MODEL,
  SEEDANCE_TEMPLATE_RESOLUTION,
} from '@/lib/seedance-templates'

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
  /** Last file-attach failure, rendered beside the pickers. */
  const [attachError, setAttachError] = useState<string | null>(null)
  /**
   * Template media, kept apart from the uploads: these are remote URLs the app
   * never holds bytes for, and their order carries the prompt's `@Video1` /
   * `@Image1` ordinals.
   */
  const [templateMedia, setTemplateMedia] = useState<
    Array<SeedanceTemplateMedia>
  >([])
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(
    null,
  )

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

  /** What the in-flight (or last) task was actually asked for. */
  const [settings, setSettings] = useState<JobSettings | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [finishedAt, setFinishedAt] = useState<number | null>(null)
  const [billing, setBilling] = useState<VideoBilling | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())

  const firstFrameInputRef = useRef<HTMLInputElement>(null)
  const lastFrameInputRef = useRef<HTMLInputElement>(null)
  const referenceInputRef = useRef<HTMLInputElement>(null)
  /**
   * Model and provider options for the task on the wire. `useGenerateVideo`
   * builds its client — and captures the fetcher — once, so a submission's
   * settings are read from here at call time instead of being closed over,
   * which is also what keeps a running task pinned to the model it was
   * submitted with while the picker moves on.
   */
  const submissionRef = useRef<{
    model: BytePlusVideoModelOrString
    options: SeedanceJobOptions
  } | null>(null)

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

  // The server holds the request open and polls Ark itself, streaming job id,
  // status and the finished url back on the one connection — so the studio
  // reads the task's whole lifecycle off the hook instead of running a timer.
  const { generate, result, jobId, videoStatus, isLoading, error } =
    useGenerateVideo({
      threadId: 'seedance-studio',
      // `options.signal` is the hook's abort signal; cancelling the response
      // is what ends the server's polling loop instead of leaving it running
      // to the 30-minute ceiling.
      fetcher: (input, options) => {
        const submission = submissionRef.current
        if (!submission) throw new Error('No Seedance task in flight')
        return generateSeedanceVideoFn({
          data: {
            prompt: input.prompt,
            model: submission.model,
            options: submission.options,
          },
          signal: options?.signal,
        })
      },
      onResult: () => {
        // Clearing the ref is what re-opens the form to the next task.
        submissionRef.current = null
        setFinishedAt(Date.now())
      },
      onError: () => {
        submissionRef.current = null
      },
      onChunk: (chunk) => {
        const usage = readVideoBilling(chunk)
        if (usage) setBilling(usage)
      },
    })

  const isBusy = isLoading

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
    setAttachError(null)
    try {
      apply(await readMediaFile(file))
    } catch (error) {
      // The input was already reset above, so without this the failure has no
      // observable effect at all: no message, no console entry, and the same
      // file re-picks to the same silence. Surface it next to the picker.
      setAttachError(
        `Could not read "${file.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  /**
   * Load a playground template. It sets four things and nothing else:
   *
   * 1. the model — Seedance 2.0, since templates need multimodal reference
   *    media, clearing any custom id that would otherwise override it;
   * 2. the prompt, verbatim from the console;
   * 3. reference mode and the template's media (replacing any uploads);
   * 4. the console's generation defaults for templates — smart length, sound
   *    on, 720p, and a ratio that follows the reference media.
   *
   * The seed is reset because a leftover one silently changes the output.
   * Watermark, priority, fixed camera, draft and flex tier are deliberately
   * left as you had them: none of them contradicts a template, and the
   * console has no opinion about them.
   */
  const applyTemplate = (template: SeedanceTemplate) => {
    if (isBusy) return
    setModelId(SEEDANCE_TEMPLATE_MODEL)
    setCustomModelId('')
    setShowAdvanced(false)
    setPrompt(template.prompt)
    setInputMode('reference')
    setTemplateMedia(template.media)
    setReferences([])
    setAppliedTemplateId(template.id)
    setSeed('')
    setAutoDuration(true)
    setGenerateAudio(true)
    setResolution(SEEDANCE_TEMPLATE_RESOLUTION)
    setRatio('adaptive')
  }

  /**
   * Edit the prompt and the card stops claiming to be applied — what's on
   * screen is no longer the template the console would have sent.
   */
  const handlePromptChange = (value: string) => {
    setPrompt(value)
    if (appliedTemplateId !== null) setAppliedTemplateId(null)
  }

  /** Dropping any of a template's media diverges it the same way. */
  const removeTemplateMedia = (url: string) => {
    setTemplateMedia((prev) => prev.filter((m) => m.url !== url))
    setAppliedTemplateId(null)
  }

  const clearTemplate = () => {
    setTemplateMedia([])
    setAppliedTemplateId(null)
  }

  const handleGenerate = async () => {
    if (!prompt.trim() && !hasImageInput) return
    // `isBusy` comes from React state, which hasn't re-rendered yet for a
    // second click in the same tick; the ref is set synchronously below and
    // cleared when the task settles, so it closes that window — without it a
    // second submit would swap the model out from under the running task.
    if (isBusy || submissionRef.current) return

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
      // Template media first and in declared order: the adapter keeps the
      // relative order of the parts within each modality, which is what the
      // prompt's `@Video1` / `@Image1` ordinals are counting.
      for (const media of templateMedia) {
        parts.push(mediaUrlToPart(media.kind, media.url, { role: 'reference' }))
      }
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

    const jobSettings: JobSettings = {
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

    submissionRef.current = { model: activeModel, options }
    setSettings(jobSettings)
    setStartedAt(Date.now())
    setFinishedAt(null)
    setBilling(undefined)
    await generate({
      prompt: parts.length === 1 && !hasImageInput ? prompt : parts,
    })
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

  const modelSelectDisabled = isBusy || unknownMode

  // Reference images are capped across both sources: a template can bring one
  // (templates 1 and 5 do), and it counts against the same budget as uploads.
  const templateImageCount = templateMedia.filter(
    (m) => m.kind === 'image',
  ).length
  const referenceImagesLeft = Math.max(
    0,
    MAX_REFERENCE_IMAGES - templateImageCount - references.length,
  )
  // Seedance rejects a reference audio that is the only reference — it needs
  // something visual to attach to. Gating it here keeps the studio's promise
  // that what the form lets you build is what the API accepts.
  const referenceVisuals =
    templateMedia.filter((m) => m.kind !== 'audio').length + references.length
  const audioOnlyReferences =
    effectiveMode === 'reference' &&
    templateMedia.some((m) => m.kind === 'audio') &&
    referenceVisuals === 0

  const readyToGenerate =
    (prompt.trim().length > 0 || hasImageInput) &&
    (effectiveMode !== 'first-frame' || firstFrame !== null) &&
    (effectiveMode !== 'first-last-frame' ||
      (firstFrame !== null && lastFrame !== null)) &&
    (effectiveMode !== 'reference' ||
      references.length + templateMedia.length > 0) &&
    !audioOnlyReferences

  return (
    <div className="space-y-6">
      <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-medium text-white">Templates</h2>
          <p className="text-sm text-gray-400">
            The Ark playground's own presets — prompt, reference media and
            settings in one click. All five need multimodal reference media, so
            applying one switches the model to Seedance 2.0.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SEEDANCE_TEMPLATES.map((template) => {
            const applied = appliedTemplateId === template.id
            return (
              <button
                key={template.id}
                onClick={() => applyTemplate(template)}
                disabled={isBusy}
                className={`text-left rounded-lg border overflow-hidden transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  applied
                    ? 'bg-blue-600/15 border-blue-500'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                {/* Hotlinked from Ark's public presets bucket — hovering plays
                    the sample rather than autoplaying five clips at once. The
                    bucket is in cn-beijing and slow to reach, so the label
                    below sits behind the video and shows through until the
                    `#t=0.1` seek paints its first frame. */}
                <div className="relative w-full aspect-video bg-gray-900">
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-gray-600">
                    <Play className="w-6 h-6" />
                    <span className="text-[10px]">hover to preview</span>
                  </div>
                  <video
                    src={`${template.previewUrl}#t=0.1`}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onMouseEnter={(e) => {
                      void e.currentTarget.play().catch(() => {})
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.pause()
                      e.currentTarget.currentTime = 0
                    }}
                    className="relative w-full h-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <div className="text-sm font-medium text-white">
                    {template.name}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {template.blurb}
                  </div>
                  <div className="text-xs text-cyan-300 mt-1.5">
                    {template.media.map((m) => m.label).join(' · ')}
                  </div>
                </div>
              </button>
            )
          })}
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
          onChange={(e) => handlePromptChange(e.target.value)}
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
          {/* Uploads are images only; reference video and audio reach the
              request through the templates above, which carry remote URLs. */}
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

        {effectiveMode === 'reference' && templateMedia.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-300">
                Template media{' '}
                <span className="text-gray-500 font-normal">
                  (sent in this order — the prompt's @-tokens count them)
                </span>
              </label>
              <button
                onClick={clearTemplate}
                disabled={isBusy}
                className="text-xs text-gray-400 hover:text-white underline disabled:opacity-50"
              >
                Remove all
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {templateMedia.map((media) => (
                <div
                  key={media.url}
                  className="flex items-center gap-2 pl-1.5 pr-2 py-1.5 bg-gray-800 border border-gray-600 rounded-lg"
                >
                  {media.kind === 'image' ? (
                    <img
                      src={media.url}
                      alt={media.label}
                      className="w-10 h-10 object-cover rounded"
                    />
                  ) : media.kind === 'video' ? (
                    <video
                      src={media.url}
                      muted
                      preload="metadata"
                      className="w-10 h-10 object-cover rounded bg-gray-900"
                    />
                  ) : (
                    <span className="flex items-center justify-center w-10 h-10 rounded bg-gray-900">
                      <Music className="w-4 h-4 text-gray-400" />
                    </span>
                  )}
                  <span className="text-xs text-gray-300 font-mono">
                    {media.label}
                  </span>
                  <button
                    onClick={() => removeTemplateMedia(media.url)}
                    disabled={isBusy}
                    className="p-0.5 text-gray-500 hover:text-white disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {effectiveMode === 'reference' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Reference images{' '}
              <span className="text-gray-500 font-normal">
                (subject and style, {referenceImagesLeft} of{' '}
                {MAX_REFERENCE_IMAGES} slots left)
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
              {referenceImagesLeft > 0 && (
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

        {attachError && (
          <p
            role="alert"
            className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2"
          >
            {attachError}
          </p>
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
                // The template's own reference images share this budget.
                [...prev, media].slice(
                  0,
                  MAX_REFERENCE_IMAGES - templateImageCount,
                ),
              ),
            )
          }
        />
      </section>

      <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-medium text-white">Model</h2>
          <p className="text-sm text-gray-400">
            Each model exposes a different slice of the Seedance request — the
            image-conditioning modes above and the output controls below both
            follow the one you pick.
          </p>
        </div>
        <div className="space-y-3">
          <select
            value={unknownMode ? '' : modelId}
            onChange={(e) => {
              const picked = SEEDANCE_MODELS.find(
                (model) => model.id === e.target.value,
              )
              if (picked) setModelId(picked.id)
            }}
            disabled={modelSelectDisabled}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {unknownMode && (
              <option value="">Custom model id: {activeModel}</option>
            )}
            {SEEDANCE_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} ({model.id})
              </option>
            ))}
          </select>
          {catalogEntry && !unknownMode && (
            <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg">
              <div className="text-xs text-cyan-300">
                {describeSeedanceModel(
                  catalogEntry,
                  capabilities.find((c) => c.model === catalogEntry.id),
                )}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {catalogEntry.blurb}
              </div>
            </div>
          )}
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

      <div className="space-y-2">
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
        {audioOnlyReferences && (
          <p className="text-xs text-amber-400/80 text-center">
            Reference audio can't be the only reference — pair it with a
            reference image or video.
          </p>
        )}
      </div>

      {(isBusy || error || result) && (
        <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-4">
          {isBusy && !jobId && (
            <div className="flex items-center gap-2 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              Submitting the task...
            </div>
          )}

          {isBusy && jobId && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-gray-300">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                <span className="font-medium">
                  {videoStatus?.status === 'processing'
                    ? 'Processing'
                    : 'Queued'}
                </span>
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <Clock className="w-3.5 h-3.5" />
                  {formatElapsed(now - (startedAt ?? now))}
                </span>
              </div>
              <p className="text-xs text-gray-500 font-mono">{jobId}</p>
              {settings?.serviceTier === 'flex' && (
                <p className="text-xs text-amber-400/80">
                  Flex is the offline batch queue — tasks routinely sit here for
                  many minutes before they start.
                </p>
              )}
            </div>
          )}

          {error && !isBusy && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error.message}
            </div>
          )}

          {/* `!error`: a failed task keeps the previous result on the hook,
              and it must not render underneath the new error. */}
          {result && !isBusy && !error && settings && (
            <div className="space-y-3">
              <div className="rounded-lg overflow-hidden border border-gray-700">
                <video
                  src={result.url}
                  controls
                  autoPlay
                  loop
                  className="w-full h-auto"
                />
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
                <Meta label="Model" value={settings.model} />
                <Meta
                  label="Output"
                  value={`${settings.ratio} · ${settings.resolution}`}
                />
                <Meta
                  label="Length"
                  value={
                    settings.frames !== null
                      ? `${settings.frames} frames @ ${SEEDANCE_FPS} fps`
                      : settings.duration === -1
                        ? 'model-chosen'
                        : `${settings.duration}s`
                  }
                />
                <Meta
                  label="Seed"
                  value={
                    settings.seed === null || settings.seed === -1
                      ? 'unseeded'
                      : String(settings.seed)
                  }
                />
                {settings.serviceTier && (
                  <Meta label="Tier" value={settings.serviceTier} />
                )}
                {startedAt !== null && finishedAt !== null && (
                  <Meta
                    label="Wall clock"
                    value={formatElapsed(finishedAt - startedAt)}
                  />
                )}
                {billing && (
                  <Meta
                    label="Billed tokens"
                    value={`${billing.unitsBilled ?? billing.totalTokens}`}
                  />
                )}
              </dl>
              <div className="flex items-center justify-between gap-4">
                <a
                  href={result.url}
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
                  {/* Typed `Date`, but it crosses the wire as an ISO string —
                      `new Date` takes either. */}
                  {result.expiresAt
                    ? ` — ${new Date(result.expiresAt).toLocaleString()}`
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
