---
title: Meshy
id: meshy-adapter
description: "Make textured GLB models from a prompt or a concept image with Meshy in TanStack AI with @tanstack/ai-meshy. Rig and animate a character from Meshy task ids, and make text-to-motion clips."
keywords:
  - tanstack ai
  - meshy
  - 3d model generation
  - generate3DModel
  - text-to-3d
  - image-to-3d
  - rigging
  - animation
  - motion generation
  - generateMotion
  - glb
  - game assets
  - adapter
---

`meshy3DModel()` with `generate3DModel()` turns a text prompt or a concept image into a textured GLB. The `jobId` of one job is the input of the next job, so you can rig and animate a character with no upload. `meshyMotion()` makes text-to-motion clips. The adapter has no chat.

> [!WARNING]
> 3D model generation and motion generation are experimental. The API can change. Meshy charges credits when it creates a task, and gives them back when the task fails.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-meshy
vue: @tanstack/ai @tanstack/ai-meshy
solid: @tanstack/ai @tanstack/ai-meshy
svelte: @tanstack/ai @tanstack/ai-meshy
preact: @tanstack/ai @tanstack/ai-meshy
angular: @tanstack/ai @tanstack/ai-meshy
vanilla: @tanstack/ai @tanstack/ai-meshy
octane: @tanstack/ai @tanstack/ai-meshy

<!-- ::end:tabs -->

## 2. Set the API key

Create an API key in your [Meshy](https://www.meshy.ai) account settings. Put it in the environment of your server:

```bash
MESHY_API_KEY=your-meshy-key
```

`meshy3DModel` and `meshyMotion` read `MESHY_API_KEY`. To pass the key in code, set `apiKey` in the last argument:

```ts
import { meshy3DModel, meshyMotion } from '@tanstack/ai-meshy'

const apiKey = process.env.MESHY_API_KEY

const imageTo3D = meshy3DModel('image-to-3d', 'meshy-7.1', { apiKey })
const rigging = meshy3DModel('rigging', { apiKey })
const motion = meshyMotion('prime', { apiKey })
```

The first argument of `meshy3DModel` is the Meshy endpoint. The second argument is the Meshy `ai_model`. Only five endpoints take an `ai_model`. The others take the config as the second argument. See [Endpoints](#endpoints).

## 3. Make your first model

Text to 3D is two jobs:

1. `text-to-3d-preview` makes the mesh, with no texture.
2. `text-to-3d-refine` paints the textures on that mesh.

This script makes a treasure chest and saves the GLB next to the script:

```ts
import { writeFile } from 'node:fs/promises'
import { generate3DModel } from '@tanstack/ai'
import { meshy3DModel } from '@tanstack/ai-meshy'

const preview = await generate3DModel({
  adapter: meshy3DModel('text-to-3d-preview', 'meshy-7.1'),
  prompt: 'A wooden treasure chest with iron bands, game asset',
  threadId: 'treasure-chest',
  wait: true,
  modelOptions: { topology: 'quad', target_polycount: 10_000 },
})

const chest = await generate3DModel({
  adapter: meshy3DModel('text-to-3d-refine', 'meshy-7'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: preview.jobId, provider: 'meshy' },
    },
    { type: 'text', content: 'Old oak planks, rusty iron bands' },
  ],
  threadId: 'treasure-chest',
  wait: true,
  modelOptions: { enable_pbr: true },
})

const response = await fetch(chest.url)
if (!response.ok) throw new Error(`Download failed: ${chest.url}`)
await writeFile('treasure-chest.glb', Buffer.from(await response.arrayBuffer()))
console.log('Saved treasure-chest.glb')
```

Run the script. You now have a textured, low-poly chest on disk. Drop the GLB into your engine.

What to know:

- `jobId` is the Meshy task id. The refine job reads the preview mesh from it, so the script uploads nothing.
- The text part of the refine job describes the textures.
- Meshy keeps generated files for 3 days, on all plans except Enterprise. Copy each file that you want to keep.

## 4. Stream the job to the browser

Pass `stream: true`. The server submits the job, checks it, and streams each status to the browser. Meshy reports a progress number from 0 to 100.

This route takes one concept image. `image-to-3d` makes a textured model in one job.

Server route at `/api/generate/3d-model`:

```ts
import {
  generate3DModel,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { meshy3DModel } from '@tanstack/ai-meshy'

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
    adapter: meshy3DModel('image-to-3d', 'meshy-7.1'),
    prompt: images,
    threadId,
    stream: true,
    abortSignal: request.signal,
    modelOptions: {
      topology: 'quad',
      target_polycount: 10_000,
      enable_pbr: true,
    },
  })
  return toServerSentEventsResponse(stream)
}
```

React component:

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useGenerate3DModel } from '@tanstack/ai-react'

const conceptUrl = 'https://example.com/concept/treasure-chest.png'

export function MeshyModel() {
  const [progress, setProgress] = useState(0)
  const { generate, result, isLoading, error } = useGenerate3DModel({
    connection: fetchServerSentEvents('/api/generate/3d-model'),
    threadId: 'treasure-chest',
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

Click **Generate model**. The progress goes up to 100%, then the download link shows. To show the model in the page, use the three.js viewer from [3D Model Generation](../media/3d-model-generation#make-your-first-model).

If the browser closes the request, `generate3DModel()` asks Meshy to cancel the task. Meshy cancels only a task that waits in the queue. A running task finishes, and Meshy charges for it.

## Rig and animate a character

Chain three jobs. Each job reads the result of the job before it from its task id:

1. `image-to-3d` makes the character mesh.
2. `rigging` adds a skeleton.
3. `animation` puts an action from the Meshy animation library on the rig.

```ts
import { generate3DModel } from '@tanstack/ai'
import { listMeshyAnimations, meshy3DModel } from '@tanstack/ai-meshy'

const threadId = 'knight'

const mesh = await generate3DModel({
  adapter: meshy3DModel('image-to-3d', 'meshy-7.1'),
  prompt: [
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/concept/knight.png' },
    },
  ],
  threadId,
  wait: true,
  modelOptions: { pose_mode: 't-pose', topology: 'quad', target_polycount: 20_000 },
})

const rig = await generate3DModel({
  adapter: meshy3DModel('rigging'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: mesh.jobId, provider: 'meshy' },
    },
  ],
  threadId,
  wait: true,
  modelOptions: { animation_type: 'biped', height_meters: 1.8 },
})

const actions = await listMeshyAnimations({ category: 'WalkAndRun' })
const action = actions.find((item) => item.rigType === 'biped')
if (!action) throw new Error('No biped action in this category.')

const clip = await generate3DModel({
  adapter: meshy3DModel('animation'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: rig.jobId, provider: 'meshy' },
    },
  ],
  threadId,
  wait: true,
  modelOptions: { action_id: action.actionId },
})

console.log(rig.url) // The rigged GLB
console.log(clip.url) // The animated GLB
```

You now have a rigged knight and an animated knight, from one concept image.

What each result holds:

- `rig.url` is the rigged GLB. `rig.files` also has the rigged FBX, and basic walk and run clips with the role `'animation'`.
- `clip.url` is the animated GLB. `clip.files` also has the animated FBX.
- `animation` takes the rig only as a Meshy task id. A URL source throws before the job starts.

More options:

- Set `skeleton_template` on `rigging` to get a known skeleton, for example `'mixamo'` or `'ue5_mannequin'`.
- Set `action_ids` on `animation` to get up to 10 clips in one job.
- `listMeshyAnimations()` costs no credits. Each action has a `previewUrl`, an animated GIF of the action.

## Make a motion clip

`meshyMotion()` with `generateMotion()` turns a prompt into a skeletal animation clip. The clip is not on a character. `duration` is required: 2 to 10 seconds, in steps of 0.5.

```ts
import { writeFile } from 'node:fs/promises'
import { generateMotion, getMotionJobStatus } from '@tanstack/ai'
import { meshyMotion } from '@tanstack/ai-meshy'

const adapter = meshyMotion('prime')

const { jobId } = await generateMotion({
  adapter,
  threadId: 'knight-attacks',
  prompt: 'A knight raises a sword overhead with both hands and slams it down',
  duration: 4,
})

let status = await getMotionJobStatus({ adapter, jobId })
while (status.status === 'pending' || status.status === 'processing') {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  status = await getMotionJobStatus({ adapter, jobId })
}

if (!status.motion) {
  throw new Error(status.error ?? 'Motion generation failed')
}

for (const asset of status.motion.assets) {
  const response = await fetch(asset.url)
  if (!response.ok) throw new Error(`Download failed: ${asset.url}`)
  const fileName = asset.fileName ?? `knight-attack.${asset.format}`
  await writeFile(fileName, Buffer.from(await response.arrayBuffer()))
  console.log(`Saved ${fileName}`)
}

console.log('Motion task id:', jobId)
```

The two modes:

| Mode | File | Use it for |
| --- | --- | --- |
| `'prime'` | FBX | A higher quality clip |
| `'swift'` | BVH | A faster and cheaper clip |

To stream the job to a browser, use the same route and component as the other motion providers. See [Show the job in a browser](../media/motion-generation#show-the-job-in-a-browser).

### Put the clip on your rig

Pass the motion `jobId` as `modelOptions.motion_task_id` to `meshy3DModel('animation')`. The rig is the `rigging` job from [Rig and animate a character](#rig-and-animate-a-character):

```ts
import { generate3DModel } from '@tanstack/ai'
import { meshy3DModel } from '@tanstack/ai-meshy'

// The ids from the rigging job and the motion job.
const rigJobId = 'your-rigging-task-id'
const motionJobId = 'your-motion-task-id'

const attack = await generate3DModel({
  adapter: meshy3DModel('animation'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: rigJobId, provider: 'meshy' },
    },
  ],
  threadId: 'knight-attacks',
  wait: true,
  modelOptions: { motion_task_id: motionJobId },
})

console.log(attack.url) // The knight, with the sword attack
```

Your knight now plays the attack from your prompt. The motion task must be complete, and the rig must be a biped.

## Endpoints

The first argument of `meshy3DModel()` picks the endpoint. TypeScript types the prompt parts and `modelOptions` for each endpoint.

| Endpoint | Prompt | `ai_model` |
| --- | --- | --- |
| `text-to-3d-preview` | Text | `'meshy-7.1'`, `'meshy-6'`, `'meshy-6-lite'`, `'meshy-t2'`, `'meshy-t2.5'`, `'latest'` |
| `text-to-3d-refine` | The preview task, plus optional text or one image for the textures | `'meshy-7'`, `'meshy-6'`, `'meshy-6-lite'`, `'meshy-n1'`, `'latest'` |
| `image-to-3d` | One image, plus optional text for the textures | The same as `text-to-3d-preview` |
| `multi-image-to-3d` | 1 to 4 images of one object, plus optional text | `'meshy-7.1'`, `'meshy-6'`, `'meshy-6-lite'`, `'latest'` |
| `retexture` | A mesh, plus text, or 1 style image, or 2 to 4 views | The same as `text-to-3d-refine` |

These endpoints change a model that you already have. They take no `ai_model`:

- `rigging` and `animation`: see [Rig and animate a character](#rig-and-animate-a-character).
- `remesh`, `convert`, `resize`, and `uv-unwrap`: see [Meshy: Advanced](./meshy-advanced#change-a-model).
- `print-repair`, `print-multi-color`, `print-split`, and `relief`: see [Meshy: Advanced](./meshy-advanced#prepare-a-model-for-a-3d-printer).

A mesh is a `model3d` part. Its source can be:

- `{ type: 'file', value: jobId, provider: 'meshy' }`: the result of an earlier Meshy job. Use this to chain jobs.
- A `url` or `data` source: a mesh file of your own. `text-to-3d-refine`, `animation`, and `print-split` take only a task id.

For checks from another request, cancel, the 3D print helpers, and bring your own key, see [Meshy: Advanced](./meshy-advanced).
