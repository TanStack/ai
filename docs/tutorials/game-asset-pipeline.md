---
title: Game Asset Pipeline
id: game-asset-pipeline
order: 3
description: "Build a React app that turns one line of text into a low-poly 3D model for a game, then paints the same mesh with a new skin. Four fal steps run in a TanStack Start app."
keywords:
  - tanstack ai
  - tutorial
  - game assets
  - 3d model generation
  - generate3dModel
  - useGenerate3dModel
  - fal
  - meshy
  - tanstack start
---

Your game needs many props: chests, barrels, crates, lamps. Each prop also needs variants, such as a wooden chest and a golden chest. To model and paint each one by hand takes hours.

This tutorial builds an app that does it from text. You type one line and get a low-poly GLB with PBR textures. Then you type a second line and get the same mesh with a new skin. The app runs 4 fal steps, and you look at the result of each step before you pay for the next one:

1. **Concept art.** `fal-ai/flux-2` draws the object on a plain background. You can also upload your own image.
2. **Mesh.** Meshy Smart Topology makes a low-poly mesh with clean triangles and PBR textures.
3. **Skin.** `fal-ai/flux-2/edit` draws the same object with a new look.
4. **Retexture.** Meshy 7 Retexture paints the mesh from step 2 with the new skin.

It takes about 20 minutes to build. One full run takes 10 to 20 minutes, and fal bills each step.

> [!WARNING]
> 3D model generation is experimental. The API can change in a minor release.

This tutorial uses React and TanStack Start. To skip the setup, open the sandbox at the end of this page. To run the steps on a server with no UI, open [3D Model Generation: Advanced](../media/3d-model-generation-advanced).

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Install the TanStack AI packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-fal

<!-- ::end:tabs -->

Get a fal key from [fal.ai](https://fal.ai/dashboard/keys).

## 2. Know the two sides

The app has two sides:

- **The page** runs in the browser. It holds the fal key, shows one card for each step, and sends the result of a step to the next step.
- **The server routes** call fal. A 3D step runs for minutes, so the server polls fal and streams the job status to the page.

The page sends URLs between the steps. It never downloads a mesh. fal reads each file from its own storage.

## 3. Keep the key in the tab

Create `src/lib/byok.ts`. `memoryStorage()` keeps the key in this tab only.

```typescript
import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { falByok } from '@tanstack/ai-fal/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [falByok],
})

// Send the request even with no key in the tab. The server then reads
// FAL_KEY from .env, or returns 401.
byok.setServerCoverage(true)
```

`setServerCoverage(true)` lets you put `FAL_KEY` in a `.env` file during development. Then you do not paste the key after each reload.

Create `src/components/fal-key-form.tsx`. `byok.update` saves the key. `useByok` reads the status.

```tsx ignore
import { useState } from 'react'
import { falByok } from '@tanstack/ai-fal/byok'
import { useByok } from '@tanstack/ai-react'
import { byok } from '@/lib/byok'

export function FalKeyForm() {
  const snapshot = useByok(byok)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const status = snapshot.status[falByok.id]
  const masked = status && 'masked' in status ? status.masked : undefined
  const missingKey = snapshot.prompt?.reason === 'missing'

  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault()
        const next = draft.trim()
        if (!next) return
        setError('')
        void byok
          .update(falByok.id, next)
          .then(() => setDraft(''))
          .catch((caught: unknown) =>
            setError(
              caught instanceof Error ? caught.message : 'Could not save key',
            ),
          )
      }}
    >
      <label className="sr-only" htmlFor="fal-key">
        fal API key
      </label>
      <input
        id="fal-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={masked ? `Saved ${masked}` : 'Paste your fal key'}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Save key
        </button>
        {masked ? (
          <button
            type="button"
            className="rounded-lg border border-gray-600 px-3 py-2 text-sm text-gray-200"
            onClick={() => {
              setError('')
              void byok
                .clear(falByok.id)
                .catch((caught: unknown) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : 'Could not clear key',
                  ),
                )
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {missingKey ? (
        <p className="text-xs text-amber-400">
          Paste a fal key, then run the step again.
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </form>
  )
}
```

For passkeys or other storage, open [Bring Your Own Key](../advanced/byok).

## 4. Add the image route

Create `src/routes/api.concept.ts`, next to `index.tsx`. Start maps this file name to the `/api/concept` path. Two steps use this route:

- **Concept art** sends text only. The route asks `fal-ai/flux-2` for one object on a plain background, seen from a three-quarter view. An image like this gives the 3D model a clean mesh.
- **Skin** sends text and the concept image. The route asks `fal-ai/flux-2/edit` to change the look, and to keep the shape and the view.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  generateImage,
  generationParamsFromRequest,
  resolveMediaPrompt,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { falImage } from '@tanstack/ai-fal'
import { falByok } from '@tanstack/ai-fal/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

export async function POST({ request }: { request: Request }) {
  // Unwrap the prompt the hook POSTed. Then read the fal key.
  const { input, threadId, runId } = await generationParamsFromRequest(
    'image',
    request,
  )
  const apiKey = getByokKey(request, falByok)
  if (!apiKey) return byokMissing(falByok)

  const { text, images } = resolveMediaPrompt(input.prompt)
  const image = images.at(0)
  if (!text) return new Response('Describe the object.', { status: 400 })

  // The skin step sends the concept image too. flux-2/edit changes the
  // look, and keeps the shape and the view of the object.
  const stream = image
    ? generateImage({
        adapter: falImage('fal-ai/flux-2/edit', { apiKey }),
        prompt: [
          {
            type: 'text',
            content: `${text}. Keep the same object, shape, camera view, and plain white background.`,
          },
          image,
        ],
        stream: true,
        threadId,
        runId,
      })
    : // One object, a plain background, a three-quarter view.
      // An image like this gives the image-to-3D model a clean mesh.
      generateImage({
        adapter: falImage('fal-ai/flux-2', { apiKey }),
        prompt: `${text}. Single game asset, three-quarter view, centered, full object in frame, plain white background, no shadow.`,
        stream: true,
        threadId,
        runId,
      })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/concept')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

`resolveMediaPrompt` splits the prompt into its text and its image parts.

## 5. Add the 3D route

Create `src/routes/api.model3d.ts`. One route runs both 3D steps. The `step` query parameter picks the fal model:

| `step` | fal model | Input | What it does |
| --- | --- | --- | --- |
| `mesh` | `meshy/t2.5/image-to-3d` | The concept image | Makes a mesh with about 10,000 triangles and PBR textures |
| `retexture` | `meshy/v7/retexture` | The mesh and the skin image | Paints the mesh with the skin, and keeps its UVs |

The page sends earlier results as prompt parts. An `image` part carries an image URL. A `model3d` part carries a mesh URL. The fal adapter sends each part to the correct input field of the model.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  generate3dModel,
  generationParamsFromRequest,
  resolveMediaPrompt,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'
import { falByok } from '@tanstack/ai-fal/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

// A Meshy job can take more than the default 10 minutes when the fal queue
// is busy.
const timeout = 20 * 60_000

export async function POST({ request }: { request: Request }) {
  // ?step=mesh or ?step=retexture
  const step = new URL(request.url).searchParams.get('step')
  const { input, threadId, runId } = await generationParamsFromRequest(
    '3dModel',
    request,
  )
  const apiKey = getByokKey(request, falByok)
  if (!apiKey) return byokMissing(falByok)

  // The page sends the results of earlier steps as prompt parts.
  const { images, models3d } = resolveMediaPrompt(input.prompt)
  const image = images.at(0)
  const mesh = models3d.at(0)

  // Step 2: the concept image to a low-poly mesh with PBR textures. Meshy
  // Smart Topology keeps to the triangle budget. @fal-ai/client has no types
  // for this model, so modelOptions is not typed here.
  if (step === 'mesh' && image) {
    const stream = generate3dModel({
      adapter: fal3dModel('meshy/t2.5/image-to-3d', { apiKey }),
      prompt: [image],
      modelOptions: { target_polycount: 10_000, enable_pbr: true },
      stream: true,
      timeout,
      threadId,
      runId,
      abortSignal: request.signal,
    })
    return toServerSentEventsResponse(stream)
  }

  // Step 4: paint the same mesh with the skin image. The UVs stay the same.
  if (step === 'retexture' && mesh && image) {
    const stream = generate3dModel({
      adapter: fal3dModel('meshy/v7/retexture', { apiKey }),
      prompt: [mesh, image],
      modelOptions: { enable_pbr: true, texture_resolution: '2k' },
      stream: true,
      timeout,
      threadId,
      runId,
      abortSignal: request.signal,
    })
    return toServerSentEventsResponse(stream)
  }

  return new Response(
    'Unknown step, or a result of an earlier step is missing.',
    {
      status: 400,
    },
  )
}

export const Route = createFileRoute('/api/model3d')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

What the route does:

- The route passes on only the parts that the step needs.
- `stream: true` makes `generate3dModel` submit the fal job, poll it every 2 seconds, and stream each status to the page.
- `timeout` gives each 3D job 20 minutes. The default is 10 minutes, and a Meshy job can take longer when the fal queue is busy.
- `modelOptions` is typed for each model that `@fal-ai/client` has types for. It has no types for `meshy/t2.5` yet, so the [model page](https://fal.ai/models/meshy/t2.5/image-to-3d/api) lists its options. `target_polycount` sets the triangle budget, up to 30,000.
- Do you need quad faces? Use `meshy/v7.1/image-to-3d` with `topology: 'quad'`. It has typed options, but it makes about twice as many triangles for the same budget.

## 6. Add the page

Replace `src/routes/index.tsx` with this file. It has two small components:

- `ImageStep` is a text field and a button. It uses `useGenerateImage`. In step 1, it also has a file field for your own image.
- `ModelStep` is a button, the job status, a preview, and a download link. It uses `useGenerate3dModel`.

When a step finishes, its `onImage` or `onModel` callback gives the URL to the page, and the next card unlocks.

```tsx ignore
import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  fetchServerSentEvents,
  useGenerate3dModel,
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
  const [uploadError, setUploadError] = useState<string | null>(null)
  // The file read in progress. A new file stops the old read, so an old
  // file cannot replace the latest one.
  const readerRef = useRef<FileReader | null>(null)
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
    readerRef.current?.abort()
    const reader = new FileReader()
    readerRef.current = reader
    setUploadError(null)
    reader.onload = () => {
      if (typeof reader.result === 'string') showImage(reader.result)
    }
    reader.onerror = () => setUploadError(`Could not read ${file.name}.`)
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
            accept="image/png,image/jpeg"
            disabled={isLoading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) upload(file)
            }}
            className="mt-1 block text-sm text-gray-300"
          />
        </label>
      ) : null}
      {error || uploadError ? (
        <p className="mt-3 text-sm text-red-400">
          {error?.message ?? uploadError}
        </p>
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
  const { generate, result, isLoading, error, stop } = useGenerate3dModel({
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
          onImage={(url) => {
            // A new concept makes the old mesh and skin wrong for it.
            setConceptUrl(url)
            setMeshUrl(null)
            setSkinUrl(null)
          }}
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
```

What the page does:

- An uploaded image becomes a `data:` URL. fal reads it the same as an image URL, so the upload needs no route.
- The upload takes PNG and JPEG only, because the Meshy mesh step takes only these formats.
- A new concept clears the mesh and the skin. Step 4 then never mixes a mesh and a skin from different concepts.
- `onProgress` gets the fal job state on each poll: `pending`, `processing`, or `completed`. fal gives no percent, so the card shows the state.
- `stop()` closes the stream, and the server asks fal to cancel the job. A job that already started can still finish, and fal bills it.
- Each card keeps its result. If a result looks wrong, run that step again before you go to the next step.

Run the app, paste your fal key, and click the 4 buttons in order. For your own character or prop, upload an image of one object on a plain background instead of clicking Draw. You can draw the skin while the mesh job runs.

<!-- ::client-example library=ai framework=react slug=game-asset-pipeline -->

You now have two game-ready GLB files of the same low-poly mesh: the link in step 2 and the link in step 4. Drop them into Blender, Godot, Unity, or Unreal. To make more variants, draw another skin and click Retexture again.

To add levels of detail, compression, a pivot, and a collision mesh, open [Finish the asset for your engine](../media/3d-model-generation-advanced#finish-the-asset-for-your-engine).

The full example is on GitHub: [TanStack/ai `examples/react/game-asset-pipeline`](https://github.com/TanStack/ai/tree/main/examples/react/game-asset-pipeline).
