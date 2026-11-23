---
title: Tripo Animated Character
id: tripo-animated-character
order: 4
description: "Build a React app that turns one line of text into a 3D game character that walks. Three chained Tripo jobs make the model, add a skeleton, and add a walk animation in a TanStack Start app."
keywords:
  - tanstack ai
  - tutorial
  - game assets
  - 3d model generation
  - generate3dModel
  - useGenerate3dModel
  - tripo
  - rigging
  - animation
  - tanstack start
---

Your game needs a character that walks. It takes days to model it, add a skeleton, and animate it by hand.

This tutorial builds an app that does it from one line of text. You describe a character and get a GLB file that walks. The app chains 3 Tripo jobs. Each job starts from the task id of the job before it:

1. **Model.** `text-to-model` makes a textured 3D model from your text.
2. **Rig.** `rig` adds a skeleton to the model.
3. **Animate.** `retarget` puts the walk animation on the skeleton.

The page then shows the walking character in `<model-viewer>`. One run takes a few minutes, and Tripo bills each job.

> [!WARNING]
> 3D model generation is experimental. The API can change in a minor release.

This tutorial uses React and TanStack Start. To skip the setup, open the sandbox at the end of this page. To run the same 3 jobs in a script, open [Rig and animate a character](../adapters/tripo#rig-and-animate-a-character).

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Install the TanStack AI packages, `@google/model-viewer`, and `three` (the 3D engine that `@google/model-viewer` runs on). The page uses `<model-viewer>` to show and play the GLB file.

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-tripo @google/model-viewer three

<!-- ::end:tabs -->

## 2. Set the API key

Get a key from [Tripo](https://developers.tripo3d.ai/en/keys). Put it in a `.env` file in the app folder:

```bash
# Your Tripo API key (https://developers.tripo3d.ai/en/keys). The server reads it.
TRIPO_API_KEY=
```

`tripo3dModel()` reads `TRIPO_API_KEY` from the server environment. The key never goes to the browser.

## 3. Know the two sides

The app has two sides:

- **The server route** calls Tripo. One request runs one job. The server polls the Tripo task and streams its progress to the page.
- **The file route** loads the finished file from Tripo on the server and sends it to the page. Tripo sends its files with no CORS header, so the browser cannot load them by itself.
- **The page** runs in the browser. It starts each job, shows the progress, and gives the task id of a finished job to the next job.

The page sends task ids between the jobs, not files. Tripo finds the model of the earlier job from its task id, so nothing is uploaded again.

## 4. Add the server route

Create `src/routes/api.character.ts`, next to `index.tsx`. Start maps this file name to the `/api/character` path.

The page sends two things in each request:

- **`step`** in the request body: `model`, `rig`, or `animate`. It picks the Tripo job.
- **`prompt`**: the text for the `model` step. For the `rig` and `animate` steps, it is the task id of the job before.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  generate3dModel,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { tripo3dModel } from '@tanstack/ai-tripo'

// One POST runs one step. The page sends the step in the body and a string
// prompt: the text for the 'model' step, or the Tripo task id of the step
// before it for the 'rig' and 'animate' steps. tripo3dModel() reads
// TRIPO_API_KEY from the server environment.
export async function POST({ request }: { request: Request }) {
  const params = await generationParamsFromRequest('3dModel', request).catch(
    () => null,
  )
  if (!params) return new Response('Invalid request body.', { status: 400 })

  const { input, forwardedProps, threadId, runId } = params
  const { step } = forwardedProps
  const { prompt } = input
  const hasPrompt = typeof prompt === 'string' && prompt.trim() !== ''
  if (!hasPrompt) {
    return new Response('The prompt must be a non-empty string.', {
      status: 400,
    })
  }

  switch (step) {
    // Step 1: text to a 3D model.
    case 'model': {
      const stream = generate3dModel({
        adapter: tripo3dModel('text-to-model'),
        prompt,
        stream: true,
        threadId,
        runId,
        abortSignal: request.signal,
      })
      return toServerSentEventsResponse(stream)
    }
    // Step 2: add a skeleton. The 'preset:walk' animation of step 3 is a
    // preset for the v3.0 rig, so this step asks for that rig model. The
    // model goes in as its Tripo task id.
    case 'rig': {
      const stream = generate3dModel({
        adapter: tripo3dModel('rig', 'v3.0-20260909'),
        prompt: [
          {
            type: 'model3d',
            source: { type: 'file', value: prompt, provider: 'tripo' },
          },
        ],
        // A GLB file, because <model-viewer> shows GLB.
        modelOptions: { out_format: 'glb' },
        stream: true,
        threadId,
        runId,
        abortSignal: request.signal,
      })
      return toServerSentEventsResponse(stream)
    }
    // Step 3: put the walk animation on the rig. Retarget takes the rig
    // only as its Tripo task id. 'animate_in_place' keeps the character in the
    // middle of the viewer. Without it, the walk moves the character out.
    case 'animate': {
      const stream = generate3dModel({
        adapter: tripo3dModel('retarget'),
        prompt: [
          {
            type: 'model3d',
            source: { type: 'file', value: prompt, provider: 'tripo' },
          },
        ],
        modelOptions: { animation: 'preset:walk', animate_in_place: true },
        stream: true,
        threadId,
        runId,
        abortSignal: request.signal,
      })
      return toServerSentEventsResponse(stream)
    }
    default:
      return new Response("The step must be 'model', 'rig', or 'animate'.", {
        status: 400,
      })
  }
}

export const Route = createFileRoute('/api/character')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

What the route does:

- `generationParamsFromRequest` reads the request. The `body` of the hook arrives in `forwardedProps`.
- A `model3d` part with `source: { type: 'file', provider: 'tripo' }` points at a finished Tripo task. Tripo reads the model from that task.
- The `rig` step asks for the `v3.0-20260909` rig model, because `preset:walk` is a preset for that rig.
- `out_format: 'glb'` makes the rig a GLB file. `<model-viewer>` shows GLB.
- `animate_in_place: true` makes the character walk on the spot. Without it, the walk moves the character forward and out of the viewer.
- `stream: true` makes `generate3dModel` start the Tripo task, poll it, and stream each status to the page.
- `abortSignal` stops the polling when the page closes the request. Tripo cannot stop a task that it started, so it still bills the task.

For other presets and rig options, open [Rig and animate a character](../adapters/tripo#rig-and-animate-a-character).

## 5. Add the file route

The page shows the file in `<model-viewer>`, which loads the file with a script. Tripo sends its files with no CORS header, so the browser blocks that load. Load the file through your server.

Create `src/routes/api.file.ts`. Start maps it to the `/api/file` path:

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'

// Tripo serves its files with no CORS header, so the browser cannot load them.
// This route fetches the file on the server and sends it to the page. It takes
// only Tripo file links, so it cannot fetch other sites.
const TRIPO_FILE_HOST = 'openapi-dl.data.tripo3d.com'

export async function GET({ request }: { request: Request }) {
  const link = new URL(request.url).searchParams.get('url')
  const fileUrl = URL.canParse(link ?? '') ? new URL(link ?? '') : null
  const isTripoFile =
    fileUrl?.protocol === 'https:' && fileUrl.hostname === TRIPO_FILE_HOST
  if (!fileUrl || !isTripoFile) {
    return new Response('The url must be a Tripo file link.', { status: 400 })
  }

  const file = await fetch(fileUrl, { signal: request.signal })
  if (!file.ok || !file.body) {
    return new Response('Tripo did not send the file.', { status: 502 })
  }
  return new Response(file.body, {
    headers: { 'content-type': 'model/gltf-binary' },
  })
}

export const Route = createFileRoute('/api/file')({
  server: {
    handlers: {
      GET,
    },
  },
})
```

What the route does:

- It takes only `https` links on the Tripo file host. Any other link gets a 400, so the route cannot fetch other sites for a stranger.
- It streams the file body through. The walking character can be more than 50 MB, so the server does not hold the whole file in memory.

## 6. Add the page

The page shows the character with `<model-viewer>`. React does not know this element, so it needs a JSX type. Create `src/model-viewer.d.ts`:

```typescript ignore
import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// JSX type for the <model-viewer> element. @google/model-viewer types the
// element for the DOM only.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src: string
        alt: string
        autoplay?: boolean
        'camera-controls'?: boolean
      }
    }
  }
}
```

Then replace `src/routes/index.tsx` with this file. It has one `useGenerate3dModel` hook for each job. All 3 hooks post to `/api/character`, and each one sends its own `step` in `body`.

```tsx ignore
import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useGenerate3dModel } from '@tanstack/ai-react'

// All three steps POST to /api/character. The `body` tells the server which
// step to run.
const connection = fetchServerSentEvents('/api/character')

function CharacterPage() {
  const [text, setText] = useState('A cartoon knight in a T-pose')
  const [progress, setProgress] = useState(0)

  // <model-viewer> uses window and customElements, so load it in the browser
  // only.
  useEffect(() => {
    void import('@google/model-viewer')
  }, [])

  // Step 3: the walk animation. Its result is the file the page shows.
  const animate = useGenerate3dModel({
    connection,
    body: { step: 'animate' },
    threadId: 'character-animate',
    onProgress: setProgress,
  })
  // Step 2: the skeleton. When it is done, start step 3 with its task id.
  const rig = useGenerate3dModel({
    connection,
    body: { step: 'rig' },
    threadId: 'character-rig',
    onProgress: setProgress,
    onResult: (result) => {
      setProgress(0)
      void animate.generate({ prompt: result.jobId })
    },
  })
  // Step 1: the model. When it is done, start step 2 with its task id.
  const model = useGenerate3dModel({
    connection,
    body: { step: 'model' },
    threadId: 'character-model',
    onProgress: setProgress,
    onResult: (result) => {
      setProgress(0)
      void rig.generate({ prompt: result.jobId })
    },
  })

  const steps = [
    { label: 'Step 1 of 3: making the model', run: model },
    { label: 'Step 2 of 3: adding a skeleton', run: rig },
    { label: 'Step 3 of 3: adding the walk animation', run: animate },
  ]
  const current = steps.find((step) => step.run.isLoading)
  const error = steps.find((step) => step.run.error)?.run.error
  const character = animate.result
  const status = current
    ? `${current.label} (${Math.round(progress)}%). This takes a few minutes.`
    : character
      ? 'Done. Your character walks.'
      : ''

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-8 text-white">
      <h1 className="text-2xl font-semibold">Tripo Animated Character</h1>
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault()
          const prompt = text.trim()
          if (!prompt) return
          // Clear the result and errors of the last run.
          rig.reset()
          animate.reset()
          setProgress(0)
          void model.generate({ prompt })
        }}
      >
        <label htmlFor="character" className="block text-sm text-gray-300">
          Describe a character with two arms and two legs
        </label>
        <div className="flex gap-2">
          <input
            id="character"
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={Boolean(current)}
            className="min-w-0 flex-1 rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={Boolean(current) || !text.trim()}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            Make character
          </button>
        </div>
      </form>

      <p role="status" className="text-sm text-gray-300">
        {status}
      </p>
      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}

      {character ? (
        <>
          {/* Tripo files have no CORS header, so /api/file loads them. */}
          <model-viewer
            src={`/api/file?url=${encodeURIComponent(character.url)}`}
            alt="Your character, walking"
            autoplay
            camera-controls
            className="block h-96 w-full rounded-lg bg-gray-800"
          />
          <p className="text-sm text-gray-300">
            The Tripo file link expires. To keep the character, download the
            file soon. Make a new character to get a new link.
          </p>
        </>
      ) : null}
    </main>
  )
}

export const Route = createFileRoute('/')({
  component: CharacterPage,
})
```

What the page does:

- The hooks are in reverse order. Each `onResult` starts the next job, so the next hook must exist first.
- `result.jobId` is the Tripo task id. The page sends it as the `prompt` of the next job.
- `onProgress` gets the percent of the Tripo task. Each step sets it back to 0 when it is done.
- The `useEffect` loads `@google/model-viewer` in the browser only. The package uses `window`, and the server does not have it.
- `src` points at `/api/file`, with the Tripo link as the `url` query value.
- `autoplay` plays the walk animation as soon as the file loads.
- A new run calls `reset()` on the rig and animate hooks. The old character and errors then go away.

The walk preset fits a character with two arms and two legs. A T-pose in the prompt helps the rig too. To check a model before you rig it, open [Check that a model can be rigged](../adapters/tripo-advanced#check-that-a-model-can-be-rigged).

## 7. Keep the file in time

The link in `character.url` is signed, and it expires. After that, `/api/file` cannot load the file again. To get a new link, make a new character.

To keep the file, download it as soon as the job ends. The task id does not expire in this way, so you can always chain more jobs from it. For a script that saves the file, open [Download the files in time](../adapters/tripo-advanced#download-the-files-in-time).

<!-- ::client-example library=ai framework=react slug=tripo-animated-character -->

You now have a character that walks, made from one line of text. Turn it with the mouse to see it from all sides. To make another character, change the text and click **Make character** again.

The full example is on GitHub: [TanStack/ai `examples/react/tripo-animated-character`](https://github.com/TanStack/ai/tree/main/examples/react/tripo-animated-character).
