import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  fetchServerSentEvents,
  useGenerate3DModel,
  useGenerateImage,
} from '@tanstack/ai-react'
import { FalKeyForm } from '@/components/fal-key-form'
import { byok } from '@/lib/byok'
import type { MediaPrompt, MediaPromptPart } from '@tanstack/ai'

const imagePart = (url: string): MediaPromptPart => ({
  type: 'image',
  source: { type: 'url', value: url },
})
const meshPart = (url: string): MediaPromptPart => ({
  type: 'model3d',
  source: { type: 'url', value: url },
})

const card = 'rounded-lg border border-orange-500/20 bg-gray-800 p-4'
const button =
  'rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50'

interface ImageStepProps {
  id: 'concept' | 'skin'
  title: string
  label: string
  initialText: string
  action: string
  // Turns the text into a prompt. null until the earlier steps are done.
  toPrompt: (text: string) => MediaPrompt | null
  onImage: (url: string) => void
  // Show a file field, so the user can use an image of their own.
  allowUpload?: boolean
}

// One image step: a text field, a button, and the image.
function ImageStep(props: ImageStepProps) {
  const { id, title, label, initialText, action, toPrompt, onImage } = props
  const [text, setText] = useState(initialText)
  // The image on screen: the last drawn or uploaded image.
  const [url, setUrl] = useState<string | null>(null)
  const prompt = text.trim() ? toPrompt(text.trim()) : null
  const showImage = (next: string) => {
    setUrl(next)
    onImage(next)
  }
  // POST to /api/concept over SSE. The result holds the image URL.
  const { generate, isLoading, error } = useGenerateImage({
    connection: fetchServerSentEvents('/api/concept'),
    threadId: `asset-${id}`,
    byok,
    onResult: (image) => {
      const next = image.images[0]?.url
      if (next) showImage(next)
    },
  })
  // An uploaded image becomes a data: URL. fal reads it like any URL.
  const upload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') showImage(reader.result)
    }
    reader.readAsDataURL(file)
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <label htmlFor={id} className="mt-3 block text-sm text-gray-300">
        {label}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={id}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={isLoading}
          className="min-w-0 flex-1 rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white"
        />
        <button
          type="button"
          onClick={() => prompt && void generate({ prompt })}
          disabled={!prompt || isLoading}
          className={button}
        >
          {isLoading ? 'Drawing...' : action}
        </button>
      </div>
      {props.allowUpload ? (
        <label className="mt-3 block text-sm text-gray-300">
          Or upload your own image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={isLoading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) upload(file)
            }}
            className="mt-1 block text-sm text-gray-300"
          />
        </label>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-400">{error.message}</p>
      ) : null}
      {url ? (
        <img src={url} alt={title} className="mt-3 max-h-64 rounded-lg" />
      ) : null}
    </section>
  )
}

interface ModelStepProps {
  step: 'mesh' | 'retexture'
  title: string
  action: string
  // The prompt parts for this step. null until the earlier steps are done.
  prompt: Array<MediaPromptPart> | null
  onModel?: (url: string) => void
}

// One 3D step: a button, the job status, a preview, and a download link.
function ModelStep({ step, title, action, prompt, onModel }: ModelStepProps) {
  const [status, setStatus] = useState('')
  // POST to /api/model3d?step=... over SSE. The server polls fal and
  // streams the job status, then the finished model.
  const { generate, result, isLoading, error, stop } = useGenerate3DModel({
    connection: fetchServerSentEvents(`/api/model3d?step=${step}`),
    threadId: `asset-${step}`,
    byok,
    onProgress: (_progress, message) => setStatus(message ?? ''),
    onResult: (model) => onModel?.(model.url),
  })

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => prompt && void generate({ prompt })}
          disabled={!prompt || isLoading}
          className={button}
        >
          {action}
        </button>
        {isLoading ? (
          <>
            <span className="text-sm text-gray-300" role="status">
              Working: {status || 'starting'}. This takes a few minutes.
            </span>
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-200"
            >
              Stop
            </button>
          </>
        ) : null}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-red-400">{error.message}</p>
      ) : null}
      {result ? (
        <div className="mt-3 space-y-3">
          {result.previewImageUrl ? (
            <img
              src={result.previewImageUrl}
              alt={`${title} preview`}
              className="max-h-64 rounded-lg bg-white"
            />
          ) : null}
          <a
            href={result.url}
            download
            className="inline-block text-sm text-orange-400 underline"
          >
            Download .{result.format}
          </a>
        </div>
      ) : null}
    </section>
  )
}

function PipelinePage() {
  const [conceptUrl, setConceptUrl] = useState<string | null>(null)
  const [meshUrl, setMeshUrl] = useState<string | null>(null)
  const [skinUrl, setSkinUrl] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-gray-900 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-white">
          Game Asset Pipeline
        </h1>
        <FalKeyForm />

        <ImageStep
          id="concept"
          title="1. Concept art"
          label="Describe one object"
          initialText="A wooden treasure chest with iron bands"
          action="Draw"
          toPrompt={(text) => text}
          onImage={setConceptUrl}
          allowUpload
        />
        <ModelStep
          step="mesh"
          title="2. Low-poly game mesh"
          action="Make mesh"
          prompt={conceptUrl ? [imagePart(conceptUrl)] : null}
          onModel={setMeshUrl}
        />
        <ImageStep
          id="skin"
          title="3. New skin"
          label="Describe a new look for the same object"
          initialText="Made of gold, with red gems"
          action="Draw skin"
          toPrompt={(text) =>
            conceptUrl
              ? [{ type: 'text', content: text }, imagePart(conceptUrl)]
              : null
          }
          onImage={setSkinUrl}
        />
        <ModelStep
          step="retexture"
          title="4. Paint the mesh with the skin"
          action="Retexture"
          prompt={
            meshUrl && skinUrl ? [meshPart(meshUrl), imagePart(skinUrl)] : null
          }
        />
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: PipelinePage,
})
