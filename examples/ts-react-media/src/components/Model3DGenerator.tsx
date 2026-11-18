import { useId, useRef, useState } from 'react'
import { Box, Download, Loader2, Paintbrush, Square } from 'lucide-react'
import { useGenerate3DModel } from '@tanstack/ai-react'
import type { Fal3DModelProviderOptions } from '@tanstack/ai-fal'
import type { MediaPrompt, MediaPromptPart } from '@tanstack/ai/client'
import type { Model3DFile } from '@tanstack/ai'
import { GlbViewer } from '@/components/GlbViewer'
import { SeedImageField } from '@/components/SeedImageField'
import { byok, callWithByok, falByok } from '@/lib/byok'
import { readMediaFile, toImagePart } from '@/lib/media'
import { MESH_TOOL_MODELS, MODEL3D_MODELS } from '@/lib/models'
import { generate3DModelFn } from '@/lib/server-functions'

/** Which step made the model on screen. */
type Step = 'base' | 'retexture'

const STEP_LABELS: Record<Step, string> = {
  base: 'Image to 3D',
  retexture: 'Retexture',
}

interface Run {
  step: Step
  model: string
  prompt: MediaPrompt
  modelOptions?: Record<string, string | number | boolean>
}

interface Progress {
  value: number
  message?: string
}

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400'
const FIELD_CLASS = `w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 disabled:opacity-50 ${FOCUS_RING}`

function describeProgress(progress: Progress | null) {
  switch (progress?.message) {
    case undefined:
      return 'Sending the request…'
    case 'pending':
      return 'Waiting in the fal queue…'
    case 'processing':
      return 'Building the model…'
    case 'completed':
      return 'Reading the result…'
    default:
      return 'Working…'
  }
}

function describeFile(file: Model3DFile, index: number) {
  const role = file.role ? ` (${file.role})` : ''
  const kind = file.format
    ? file.format.toUpperCase()
    : (file.contentType ?? 'file')
  return `File ${index + 1}: ${kind}${role}`
}

function meshPart(url: string): MediaPromptPart {
  return { type: 'model3d', source: { type: 'url', value: url } }
}

/**
 * Image-to-3D with fal, then an optional retexture of the result: new
 * textures from a reference image. Retexture takes the current model as a
 * `model3d` prompt part, so it can run again on its own result.
 */
export default function Model3DGenerator() {
  const [files, setFiles] = useState<Array<File>>([])
  const [modelId, setModelId] = useState<string>(MODEL3D_MODELS[0].id)
  const [textHint, setTextHint] = useState('')
  const [styleFiles, setStyleFiles] = useState<Array<File>>([])
  const [step, setStep] = useState<Step>('base')
  const [progress, setProgress] = useState<Progress | null>(null)
  // The hook builds its client once, so the fetcher reads the endpoint of
  // each run from this ref and not from a captured value.
  const runModelRef = useRef<string>(MODEL3D_MODELS[0].id)
  const modelSelectId = useId()
  const textHintId = useId()
  const resultHeadingId = useId()
  const toolsHeadingId = useId()

  const selected =
    MODEL3D_MODELS.find((model) => model.id === modelId) ?? MODEL3D_MODELS[0]

  const { generate, result, isLoading, error, stop } = useGenerate3DModel({
    threadId: 'media-3d',
    byok,
    byokProvider: () => falByok.id,
    fetcher: (input, options) =>
      callWithByok(
        generate3DModelFn({
          data: {
            model: runModelRef.current,
            prompt: input.prompt,
            ...(input.modelOptions ? { modelOptions: input.modelOptions } : {}),
          },
          signal: options.signal,
          headers: options.headers,
        }),
      ),
    onProgress: (value, message) => setProgress({ value, message }),
  })

  const run = (next: Run) => {
    runModelRef.current = next.model
    setStep(next.step)
    setProgress(null)
    void generate({
      prompt: next.prompt,
      ...(next.modelOptions ? { modelOptions: next.modelOptions } : {}),
    })
  }

  const handleGenerate = async () => {
    const file = files[0]
    if (!file || isLoading) return
    const image = toImagePart(await readMediaFile(file))
    const text = textHint.trim()
    const sendText = selected.takesText && text.length > 0
    run({
      step: 'base',
      model: selected.id,
      prompt: sendText ? [{ type: 'text', content: text }, image] : [image],
    })
  }

  // A failed run keeps the previous model on the hook. Hide it under the
  // error so it does not look like the result of the failed run.
  const shown = result && !isLoading && !error ? result : null
  const isGlb = shown?.format === 'glb'

  const handleRetexture = async () => {
    const styleFile = styleFiles[0]
    if (!shown || !styleFile) return
    const reference = toImagePart(await readMediaFile(styleFile))
    const modelOptions = {
      texture_size: '2048',
    } satisfies Fal3DModelProviderOptions<typeof MESH_TOOL_MODELS.retexture.id>
    run({
      step: 'retexture',
      model: MESH_TOOL_MODELS.retexture.id,
      prompt: [meshPart(shown.url), reference],
      modelOptions,
    })
  }

  const statusText = isLoading
    ? `${STEP_LABELS[step]}: ${describeProgress(progress)}`
    : shown
      ? `${STEP_LABELS[step]} is ready.`
      : ''
  const progressValue =
    progress && progress.value > 0 ? progress.value : undefined
  const downloads: Array<Model3DFile> = shown
    ? (shown.files ?? [{ url: shown.url, format: shown.format }])
    : []

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <p className="block text-sm font-medium text-gray-300 mb-2">
            Source image
          </p>
          <SeedImageField
            files={files}
            onChange={setFiles}
            required
            disabled={isLoading}
          />
        </div>

        <div>
          <label
            htmlFor={modelSelectId}
            className="block text-sm font-medium text-gray-300 mb-2"
          >
            Model
          </label>
          <select
            id={modelSelectId}
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            disabled={isLoading}
            className={FIELD_CLASS}
          >
            {MODEL3D_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} ({model.note})
              </option>
            ))}
          </select>
        </div>

        {selected.takesText ? (
          <div>
            <label
              htmlFor={textHintId}
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Text hint{' '}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <input
              id={textHintId}
              type="text"
              value={textHint}
              onChange={(event) => setTextHint(event.target.value)}
              disabled={isLoading}
              placeholder="For example: a wooden chair with a red cushion"
              className={FIELD_CLASS}
            />
          </div>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={isLoading || files.length === 0}
            className={`flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${FOCUS_RING}`}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            ) : (
              <Box className="w-5 h-5" aria-hidden="true" />
            )}
            Generate 3D model
          </button>
          {isLoading ? (
            <button
              type="button"
              onClick={stop}
              className={`px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2 ${FOCUS_RING}`}
            >
              <Square className="w-4 h-4" aria-hidden="true" />
              Stop
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <p role="status" className="text-sm text-gray-300">
          {statusText}
        </p>
        {isLoading ? (
          <progress
            aria-label={`${STEP_LABELS[step]} progress`}
            max={100}
            value={progressValue}
            className="w-full h-2 accent-blue-500"
          />
        ) : null}
        {error && !isLoading ? (
          <p
            role="alert"
            className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300"
          >
            {error.message}
          </p>
        ) : null}
      </div>

      {shown ? (
        <section aria-labelledby={resultHeadingId} className="space-y-4">
          <h2 id={resultHeadingId} className="text-lg font-medium text-white">
            Result: {STEP_LABELS[step]}
          </h2>
          {isGlb ? (
            <GlbViewer
              url={shown.url}
              className="aspect-video w-full rounded-lg border border-gray-700"
            />
          ) : (
            <p className="text-sm text-gray-300">
              This model is a {shown.format.toUpperCase()} file. The preview and
              the mesh tools need a GLB file. Use the download links.
            </p>
          )}
          {shown.previewImageUrl ? (
            <img
              src={shown.previewImageUrl}
              alt="Preview render of the generated 3D model"
              className="max-h-48 rounded-lg border border-gray-700"
            />
          ) : null}

          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">
              Downloads
            </h3>
            <ul role="list" className="flex flex-wrap gap-2">
              {downloads.map((file, index) => (
                <li key={file.url}>
                  <a
                    href={file.url}
                    download
                    className={`inline-flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-200 ${FOCUS_RING}`}
                  >
                    <Download className="w-4 h-4" aria-hidden="true" />
                    {describeFile(file, index)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {isGlb ? (
            <section aria-labelledby={toolsHeadingId} className="space-y-3">
              <h3
                id={toolsHeadingId}
                className="text-sm font-medium text-gray-300"
              >
                Retexture
              </h3>
              <p className="text-xs text-gray-400">
                Paints the model above with the look of a reference image, and
                shows the new result.
              </p>
              <div className="space-y-2">
                <SeedImageField
                  files={styleFiles}
                  onChange={setStyleFiles}
                  required={false}
                  disabled={isLoading}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRetexture()}
                    disabled={styleFiles.length === 0}
                    className={`px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${FOCUS_RING}`}
                  >
                    <Paintbrush className="w-4 h-4" aria-hidden="true" />
                    Retexture
                  </button>
                </div>
              </div>
            </section>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
