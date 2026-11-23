---
title: Tripo
id: tripo-adapter
description: "Make textured GLB models from a prompt or an image with Tripo in TanStack AI with @tanstack/ai-tripo. Rig a character and add a walk animation from Tripo task ids."
keywords:
  - tanstack ai
  - tripo
  - 3d model generation
  - generate3DModel
  - text-to-model
  - image-to-model
  - rigging
  - retarget
  - animation
  - glb
  - game assets
  - adapter
---

`tripo3DModel()` with `generate3DModel()` turns a text prompt or an image into a textured GLB. The `jobId` of one job is the input of the next job, so you can rig and animate a character with no upload. The adapter has no chat.

> [!WARNING]
> 3D model generation is experimental. The API can change. Tripo charges credits when it creates a task, and gives them back when the task fails. Tripo cannot stop a task that it started.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-tripo
vue: @tanstack/ai @tanstack/ai-tripo
solid: @tanstack/ai @tanstack/ai-tripo
svelte: @tanstack/ai @tanstack/ai-tripo
preact: @tanstack/ai @tanstack/ai-tripo
angular: @tanstack/ai @tanstack/ai-tripo
vanilla: @tanstack/ai @tanstack/ai-tripo
octane: @tanstack/ai @tanstack/ai-tripo

<!-- ::end:tabs -->

## 2. Set the API key

Create an API key on the [Tripo developer console](https://developers.tripo3d.ai/en/keys). Put it in the environment of your server:

```bash
TRIPO_API_KEY=your-tripo-key
```

`tripo3DModel` reads `TRIPO_API_KEY`. To pass the key in code, set `apiKey` in the last argument:

```ts
import { tripo3DModel } from '@tanstack/ai-tripo'

const apiKey = process.env.TRIPO_API_KEY

const imageToModel = tripo3DModel('image-to-model', { apiKey })
const rig = tripo3DModel('rig', 'v3.0-20260909', { apiKey })
```

The first argument is the Tripo endpoint. The second argument is the Tripo `model`, and you can leave it out. See [Endpoints](#endpoints).

For a Tripo account in China, set `baseUrl` in the same object:

```ts
import { tripo3DModel } from '@tanstack/ai-tripo'

const adapter = tripo3DModel('image-to-model', {
  baseUrl: 'https://openapi.tripo3d.com/v3',
})
```

## 3. Make your first model

`image-to-model` makes a textured model from one image in one job. This script makes a lantern and saves the GLB next to the script:

```ts
import { writeFile } from 'node:fs/promises'
import { generate3DModel } from '@tanstack/ai'
import { tripo3DModel } from '@tanstack/ai-tripo'

const lantern = await generate3DModel({
  adapter: tripo3DModel('image-to-model'),
  prompt: [
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/concept/lantern.png' },
    },
  ],
  threadId: 'lantern',
  wait: true,
  modelOptions: { face_limit: 10_000, texture_quality: 'detailed' },
})

const response = await fetch(lantern.url)
if (!response.ok) throw new Error(`Download failed: ${lantern.url}`)
await writeFile('lantern.glb', Buffer.from(await response.arrayBuffer()))
console.log('Saved lantern.glb')
```

Run the script. You now have a textured lantern on disk. Drop the GLB into your engine.

What to know:

- The adapter sends the model `v3.1-20260211` when you give no model.
- `jobId` is the Tripo task id. Pass it to the next job to change the model.
- The links in the result are signed, and they expire. Download each file soon. See [Download the files in time](./tripo-advanced#download-the-files-in-time).
- An image with a `data` source goes up to Tripo first. Tripo takes no data URI.

### Pick a generation model

Pass the model as the second argument. TypeScript then types `modelOptions` for that model:

```ts
import { generate3DModel } from '@tanstack/ai'
import { tripo3DModel } from '@tanstack/ai-tripo'

const barrel = await generate3DModel({
  adapter: tripo3DModel('text-to-model', 'P2-20260801'),
  prompt: 'A wooden barrel with iron bands, game asset',
  threadId: 'barrel',
  wait: true,
  modelOptions: { face_limit: 2_000, quad: true },
})

console.log(barrel.url) // A low-poly barrel with 2,000 quad faces
```

The generation models:

| Model | Use it for |
| --- | --- |
| `'v3.1-20260211'` | The default. The most detail. |
| `'v3.0-20250812'`, `'v2.5-20250123'` | Earlier H series models. `v2.5` has fewer options. |
| `'P1-20260311'` | Low poly, 50 to 20,000 faces. |
| `'P2-20260801'` | Low poly, up to 50,000 triangles or 25,000 quads. Takes `quad`. |

A field that the model does not take is a type error. For example, `quad` is a type error on `'P1-20260311'`.

## 4. Stream the job to the browser

Pass `stream: true`. The server submits the job, checks it, and streams each status to the browser. Tripo reports a progress number from 0 to 100.

Server route at `/api/generate/3d-model`:

```ts
import {
  generate3DModel,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { tripo3DModel } from '@tanstack/ai-tripo'

export async function POST(request: Request) {
  const { input, threadId } = await generationParamsFromRequest(
    '3dModel',
    request,
  )
  const images = Array.isArray(input.prompt)
    ? input.prompt.filter((part) => part.type === 'image')
    : []
  if (images.length !== 1) {
    return new Response('Send one image.', { status: 400 })
  }

  const stream = generate3DModel({
    adapter: tripo3DModel('image-to-model'),
    prompt: images,
    threadId,
    stream: true,
    abortSignal: request.signal,
    modelOptions: { face_limit: 10_000, texture_quality: 'detailed' },
  })
  return toServerSentEventsResponse(stream)
}
```

React component:

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useGenerate3DModel } from '@tanstack/ai-react'

const conceptUrl = 'https://example.com/concept/lantern.png'

export function TripoModel() {
  const [progress, setProgress] = useState(0)
  const { generate, result, isLoading, error } = useGenerate3DModel({
    connection: fetchServerSentEvents('/api/generate/3d-model'),
    threadId: 'lantern',
    onProgress: (value) => setProgress(value),
  })

  return (
    <div>
      <button
        onClick={() =>
          generate({
            prompt: [
              { type: 'image', source: { type: 'url', value: conceptUrl } },
            ],
          })
        }
        disabled={isLoading}
      >
        Generate model
      </button>
      {isLoading ? <p>Progress: {progress}%</p> : null}
      {error ? <p role="alert">{error.message}</p> : null}
      {result ? <a href={result.url}>Download the .{result.format} file</a> : null}
    </div>
  )
}
```

Click **Generate model**. The progress goes up to 100%, then the download link shows. The link expires, so download the file soon. To show the model in the page, load the file through your server, because Tripo sends its files with no CORS header. [Tripo Animated Character](../tutorials/tripo-animated-character) shows how.

What to know:

- If the browser closes the request, the server stops checking the job. Tripo cannot stop a running task, so the task finishes and Tripo charges for it.
- The default `timeout` is 10 minutes. For a long job, set a larger `timeout`, for example `timeout: 30 * 60_000`. A timeout does not stop the task either.

## Rig and animate a character

Chain three jobs. Each job reads the result of the job before it from its task id:

1. `text-to-model` makes the character mesh. `image-to-model` works too.
2. `rig` adds a skeleton.
3. `retarget` puts a preset animation on the rig.

This script makes a walking robot and saves the GLB:

```ts
import { writeFile } from 'node:fs/promises'
import { generate3DModel } from '@tanstack/ai'
import { tripo3DModel } from '@tanstack/ai-tripo'

const threadId = 'robot'

const mesh = await generate3DModel({
  adapter: tripo3DModel('text-to-model'),
  prompt: 'A friendly cartoon robot, full body, standing in a T-pose',
  threadId,
  wait: true,
})

const rig = await generate3DModel({
  adapter: tripo3DModel('rig', 'v3.0-20260909'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: mesh.jobId, provider: 'tripo' },
    },
  ],
  threadId,
  wait: true,
  modelOptions: { rig_type: 'biped' },
})

const walk = await generate3DModel({
  adapter: tripo3DModel('retarget'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: rig.jobId, provider: 'tripo' },
    },
  ],
  threadId,
  wait: true,
  modelOptions: { animation: 'preset:walk' },
})

const response = await fetch(walk.url)
if (!response.ok) throw new Error(`Download failed: ${walk.url}`)
await writeFile('robot-walk.glb', Buffer.from(await response.arrayBuffer()))
console.log('Saved robot-walk.glb')
```

Run the script. You now have a robot that walks, from one prompt. For a full app that does this in the browser, see [Make an animated character with Tripo](../tutorials/tripo-animated-character).

What each result holds:

- `rig.url` is the rigged GLB.
- `walk.url` is the animated GLB, with the mesh.
- `retarget` takes the rig only as a Tripo task id. Any other source throws before the job starts.

Settings for your engine:

- Set `out_format: 'fbx'` on `rig` or `retarget` to get an FBX file.
- Set `spec` on the `v3.0-20260909` rig to get known bone names, for example `'mixamo'`, `'unity'`, or `'unreal'`.
- Set `animate_in_place: true` on `retarget` to keep the root still. Your character controller then moves the character.
- Set `animations` on `retarget` to get 1 to 5 presets in one job. Each clip is in `walk.files` with the role `'animation'`.

To check a model before you pay for the rig, see [Check that a model can be rigged](./tripo-advanced#check-that-a-model-can-be-rigged).

## Endpoints

The first argument of `tripo3DModel()` picks the endpoint. TypeScript types the prompt parts and `modelOptions` for each endpoint.

| Endpoint | Prompt | Tripo `model` |
| --- | --- | --- |
| `text-to-model` | Text | `'v3.1-20260211'` (default), `'v3.0-20250812'`, `'v2.5-20250123'`, `'P1-20260311'`, `'P2-20260801'` |
| `image-to-model` | One image | The same as `text-to-model` |
| `multiview-to-model` | 2 to 4 images of one object: front, left, back, right | The same as `text-to-model` |
| `rig` | One mesh | `'v1.0-20240301'` (default, biped only), `'v2.5-20260210'`, `'v3.0-20260909'` |
| `retarget` | The task id of a rig | None |

These endpoints change a model that you already have. See [Tripo: Advanced](./tripo-advanced#change-a-model):

- `texture`: new textures from text or images.
- `convert`: a new file format.
- `decimate`: fewer faces.
- `uv`: a new UV layout.
- `segment`: the model split into parts.

A mesh is a `model3d` part. Its source can be:

- `{ type: 'file', value: jobId, provider: 'tripo' }`: the result of an earlier Tripo job. Use this to chain jobs.
- A `url` or `data` source: a mesh file of your own. A `data` source goes up to Tripo first.

For credits, uploads, checks from another request, errors, and bring your own key, see [Tripo: Advanced](./tripo-advanced).
