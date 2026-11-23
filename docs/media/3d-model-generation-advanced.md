---
title: "3D Model Generation: Advanced"
id: 3d-model-generation-advanced
order: 7.6
description: "Chain concept art, a low-poly mesh, and new skins on the server with generate3dModel(). Rig characters with Meshy or Tripo, poll jobs yourself, and handle errors."
keywords:
  - tanstack ai
  - 3d model generation
  - generate3dModel
  - get3dModelJobStatus
  - asset pipeline
  - low poly
  - retexture
  - rigging
  - meshy
  - tripo
  - hunyuan3d
  - trellis
  - fal
  - game assets
---

Run each step of an asset pipeline on the server with `wait: true`. Pass the URL of one step to the next step as a prompt part. Start with [3D Model Generation](./3d-model-generation) for the quick setup. To run the same steps from a page, with a check after each step, follow the [Game Asset Pipeline](../tutorials/game-asset-pipeline) tutorial.

> [!WARNING]
> 3D model generation is experimental. The API can change in a minor release. Each step of a pipeline is a separate fal job, and fal bills each job.

## Wait for the model on the server

`wait: true` runs the full job and returns the finished `Model3dResult`. No browser needs to wait for a stream. Use it in a script, a queue worker, or a pipeline:

```typescript
import { generate3dModel } from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'

const model = await generate3dModel({
  adapter: fal3dModel('fal-ai/hunyuan-3d/v3.1/pro/text-to-3d'),
  prompt: 'A stone well with a wooden roof, game asset',
  threadId: 'well',
  wait: true,
})

console.log(model.url, model.format) // 'https://...glb', 'glb'
```

`wait` and `stream` cannot both be `true`. A failed job rejects with the message from fal.

## Build a game asset pipeline

This function makes a low-poly treasure chest from one line of text, and then a second skin for the same mesh. It runs four fal jobs, one after the other:

1. **Concept art.** `fal-ai/flux-2` draws the chest.
2. **Mesh.** Meshy 7.1 makes a low-poly mesh with quad faces and PBR textures.
3. **Skin.** `fal-ai/flux-2/edit` draws the same chest in gold.
4. **Retexture.** Meshy 7 Retexture paints the mesh from step 2 with the gold skin.

```typescript
import { generate3dModel, generateImage } from '@tanstack/ai'
import { fal3dModel, falImage } from '@tanstack/ai-fal'
import type { ImageGenerationResult } from '@tanstack/ai'

function firstImageUrl(result: ImageGenerationResult) {
  const url = result.images[0]?.url
  if (!url) throw new Error('The image step returned no URL.')
  return url
}

export async function buildTreasureChest(threadId: string) {
  // 1. Concept art
  const concept = await generateImage({
    adapter: falImage('fal-ai/flux-2'),
    prompt:
      'A wooden treasure chest with iron bands, game asset, three-quarter view, plain white background',
    threadId,
  })
  const conceptUrl = firstImageUrl(concept)

  // 2. A low-poly mesh with quad faces and PBR textures
  const mesh = await generate3dModel({
    adapter: fal3dModel('meshy/v7.1/image-to-3d'),
    prompt: [{ type: 'image', source: { type: 'url', value: conceptUrl } }],
    threadId,
    wait: true,
    modelOptions: { topology: 'quad', target_polycount: 10_000, enable_pbr: true },
  })

  // 3. The same chest with a new look
  const skin = await generateImage({
    adapter: falImage('fal-ai/flux-2/edit'),
    prompt: [
      {
        type: 'text',
        content: 'Made of gold, with red gems. Keep the same object and view.',
      },
      { type: 'image', source: { type: 'url', value: conceptUrl } },
    ],
    threadId,
  })

  // 4. Paint the same mesh with the new skin
  const golden = await generate3dModel({
    adapter: fal3dModel('meshy/v7/retexture'),
    prompt: [
      { type: 'model3d', source: { type: 'url', value: mesh.url } },
      { type: 'image', source: { type: 'url', value: firstImageUrl(skin) } },
    ],
    threadId,
    wait: true,
    modelOptions: { enable_pbr: true, texture_resolution: '2k' },
  })

  return { wooden: mesh, golden }
}
```

Call `buildTreasureChest('chest-1')`. After about 10 minutes, it returns two `Model3dResult` values. Each `url` is a GLB of the same low-poly mesh with a different skin.

How the parts reach fal:

- An image part goes to the image field of the model, for example `image_url` on Meshy 7.1.
- A `model3d` part goes to the mesh field of the model. The fal adapter lists the field for each model in [Mesh input models](../adapters/fal#mesh-input-models).
- On Meshy 7 Retexture, the image part goes to `image_style_url`, the style of the new textures. A text part goes to `text_style_prompt`. With both, Meshy uses the image.

Some changes to try:

- Set `target_polycount` higher for a hero asset that the camera sees close up.
- Set `texture_resolution` to `'4k'` or `'8k'` on step 4 for sharper textures.
- Set `enable_rigging: true` on step 2 for a character. See [Rig and animate a character](#rig-and-animate-a-character).
- Repeat steps 3 and 4 with other text to make more skins for one mesh.

## Rig and animate a character

Meshy 7.1 can rig a humanoid character and add animations in the same job:

```typescript
import { generate3dModel } from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'

const characterUrl = 'https://example.com/concept/knight.png'

const knight = await generate3dModel({
  adapter: fal3dModel('meshy/v7.1/image-to-3d'),
  prompt: [{ type: 'image', source: { type: 'url', value: characterUrl } }],
  threadId: 'knight',
  wait: true,
  modelOptions: {
    topology: 'quad',
    target_polycount: 20_000,
    pose_mode: 't-pose',
    enable_rigging: true,
    enable_animation: true,
  },
})

const rigged = knight.files?.find((file) => file.role === 'rigged')
const animations =
  knight.files?.filter((file) => file.role === 'animation') ?? []

console.log(rigged?.url)
console.log(animations.map((file) => file.url))
```

What to know:

- `url` is the textured mesh with no skeleton. Load the file with the role `'rigged'` in your engine.
- Each animation is a separate file with the role `'animation'`. Rigging includes basic walk and run animations.
- `enable_animation` needs `enable_rigging`. Set `animation_action_id` to pick a preset from the [Meshy animation library](https://docs.meshy.ai/en/api/animation-library).
- Rigging works best on a humanoid character with clear arms and legs. A T-pose or an A-pose in the concept art helps.

The roles that a file can have:

| Role | What the file holds |
| --- | --- |
| `'base'` | The mesh as the provider made it |
| `'pbr'` | The mesh with PBR materials |
| `'rigged'` | The mesh with a skeleton |
| `'animation'` | An animated version of the mesh |
| `'part'` | One part of a mesh that the provider split into parts |

### Rig and animate with the Meshy API

`meshy3dModel()` from `@tanstack/ai-meshy` runs the mesh, the rig, and each animation as separate jobs. Each job reads the result of the job before it from its Meshy task id, so you upload nothing:

```typescript
import { generate3dModel } from '@tanstack/ai'
import { meshy3dModel } from '@tanstack/ai-meshy'

// The jobId of an earlier meshy3dModel('image-to-3d') job
const meshJobId = 'your-mesh-task-id'

const rig = await generate3dModel({
  adapter: meshy3dModel('rigging'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: meshJobId, provider: 'meshy' },
    },
  ],
  threadId: 'knight',
  wait: true,
  modelOptions: { skeleton_template: 'ue5_mannequin' },
})

console.log(rig.url) // The rigged GLB
```

With this path, you can also:

- Pick any action from the Meshy animation library, or up to 10 actions in one job.
- Put a text-to-motion clip from `meshy3dMotion()` on the rig.
- Pick a skeleton for your engine, for example `'mixamo'` or `'ue5_mannequin'`.

The full chain is in [Meshy: rig and animate a character](../adapters/meshy#rig-and-animate-a-character).

### Rig and animate with the Tripo API

`tripo3dModel()` from `@tanstack/ai-tripo` runs the rig and each animation as separate jobs. Each job reads the result of the job before it from its Tripo task id, so you upload nothing:

```typescript
import { generate3dModel } from '@tanstack/ai'
import { tripo3dModel } from '@tanstack/ai-tripo'

// The jobId of an earlier tripo3dModel('image-to-model') job
const meshJobId = 'your-mesh-task-id'

const rig = await generate3dModel({
  adapter: tripo3dModel('rig', 'v3.0-20260909'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: meshJobId, provider: 'tripo' },
    },
  ],
  threadId: 'knight',
  wait: true,
})

const walk = await generate3dModel({
  adapter: tripo3dModel('retarget'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: rig.jobId, provider: 'tripo' },
    },
  ],
  threadId: 'knight',
  wait: true,
  modelOptions: { animation: 'preset:walk' },
})

console.log(walk.url) // The animated GLB
```

The rig types and the animation presets are in [Tripo](../adapters/tripo). To build a page that makes an animated character from one image, follow the [Tripo Animated Character](../tutorials/tripo-animated-character) tutorial.

## Poll the job yourself

Without `stream` or `wait`, `generate3dModel()` only submits the job and returns `{ jobId, model }`. Save the job id, then read the job later with `get3dModelJobStatus()`. Use this for your own queue, or for a cron job that checks many jobs:

```typescript
import { generate3dModel, get3dModelJobStatus } from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'

const adapter = fal3dModel('fal-ai/hunyuan-3d/v3.1/pro/text-to-3d')

// 1. Submit the job, and save the id (for example in your database)
const { jobId } = await generate3dModel({
  adapter,
  prompt: 'A stone well with a wooden roof',
  threadId: 'well',
})

// 2. Later, in a queue worker
const status = await get3dModelJobStatus({ adapter, jobId })
if (status.status === 'completed' && status.result) {
  console.log('Model ready:', status.result.url)
} else if (status.status === 'failed') {
  console.error('Job failed:', status.error)
}
```

`get3dModelJobStatus()` returns `{ jobId, status, progress?, error?, result? }`:

- `status` is `'pending'`, `'processing'`, `'completed'`, or `'failed'`.
- `result` is the `Model3dResult`. It is set only when `status` is `'completed'`.
- Use an adapter with the same model id as the submit call.

Some more facts about this mode:

- `get3dModelJobStatus()` runs no middleware. For one middleware run over the full job, use `wait` or `stream`.
- In submit mode, `timeout` covers only the submit request, and has no default.
- To cancel a submitted job, call `adapter.cancel3dModelJob(jobId)`. fal can refuse to cancel a job that already runs.

## Stop a job

With `stream` or `wait`, two options stop the run:

- `timeout`: milliseconds for the full job. The default is 10 minutes.
- `abortSignal`: your own signal. The first of the two to fire stops the run.

When the run stops after fal accepted the job, `generate3dModel()` asks fal to cancel the job. The cancel is best effort. A failed cancel goes to the error log.

In a pipeline, each step has its own `timeout`. To stop all the steps at once, give every step the same signal:

```typescript
import { generate3dModel } from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'

// Stop the full pipeline after 30 minutes
const signal = AbortSignal.timeout(30 * 60_000)

const mesh = await generate3dModel({
  adapter: fal3dModel('fal-ai/hunyuan3d-v3/text-to-3d'),
  prompt: 'A wooden barrel, game asset',
  threadId: 'barrel',
  wait: true,
  abortSignal: signal,
})

const snowy = await generate3dModel({
  adapter: fal3dModel('fal-ai/trellis-2/retexture'),
  prompt: [
    { type: 'model3d', source: { type: 'url', value: mesh.url } },
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/barrel-snow.png' },
    },
  ],
  threadId: 'barrel',
  wait: true,
  abortSignal: signal,
})

console.log(snowy.url)
```

## Errors

TypeScript narrows the prompt parts for each model. For example, a `model3d` part on an image-to-3D model is a compile error. Text parts always type-check, so a wrong text part fails at runtime.

If the model cannot use a part, the fal adapter throws before it submits the job. This happens for:

- Text on a model that takes no text, for example an image-to-3D model or TRELLIS-2 retexture.
- Image parts on a model that takes none, for example a text-to-3D model. Multi-view models take their views in `modelOptions`.
- A `model3d` part on a model with no mesh field, or more than one `model3d` part.
- A video or audio part. No fal 3D model takes them.

A job can also fail on fal:

- With `wait`, the call rejects with the message from fal.
- With `stream`, the stream ends with `RUN_ERROR`, and the hook sets `error`.
- If the finished job has no mesh file, the adapter throws. The message lists the output fields that fal returned.

```typescript
import { generate3dModel } from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'

try {
  const model = await generate3dModel({
    adapter: fal3dModel('fal-ai/hunyuan-3d/v3.1/pro/text-to-3d'),
    prompt: 'A wooden barrel',
    threadId: 'barrel',
    wait: true,
  })
  console.log(model.url)
} catch (error) {
  if (error instanceof Error) console.error(error.message)
}
```

## Finish the asset for your engine

A generated GLB is a good start, but most engines need more work on it. TanStack AI does not do these steps:

- **Levels of detail (LODs).** Make them with the `simplify` function of [glTF-Transform](https://gltf-transform.dev).
- **Compression.** Draco or meshopt compression makes the file smaller. glTF-Transform does both.
- **Scale and pivot.** Generated models have no real-world scale. Set the scale and the pivot in [Blender](https://www.blender.org) or in your engine.
- **Collision meshes.** Make a simple collision shape in Blender or in your engine.
- **Other formats.** To get FBX for an engine that needs it, import the GLB in Blender and export it again.

Your treasure chest now has clean topology and game-style textures, and is ready for these last steps.
