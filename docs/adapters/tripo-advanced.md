---
title: "Tripo: Advanced"
id: tripo-advanced
description: "Retexture, convert, decimate, UV unwrap, and split a model with Tripo in TanStack AI. Check your credits, check that a model can be rigged, upload a file once, read jobs from another request, and bring your own key."
keywords:
  - tanstack ai
  - tripo
  - retexture
  - decimate
  - uv unwrap
  - segment
  - generate3dModel
  - get3dModelJobStatus
  - adapter
---

Pass a model that you already have to a Tripo endpoint, for example `tripo3dModel('decimate')`. You get back a changed model: new textures, a new file format, fewer faces, a new UV layout, or parts. To make a first model, start at [Tripo](./tripo).

## Change a model

A mesh is a `model3d` part. Use a Tripo task id to change the result of an earlier job. Use a URL to change a file of your own. Each endpoint takes one mesh.

### Paint new textures

`texture` paints new textures on a mesh. The text describes the textures:

```ts
import { generate3dModel } from '@tanstack/ai'
import { tripo3dModel } from '@tanstack/ai-tripo'

const bronze = await generate3dModel({
  adapter: tripo3dModel('texture'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: 'your-tripo-task-id', provider: 'tripo' },
    },
    { type: 'text', content: 'Weathered bronze with green patina' },
  ],
  threadId: 'statue',
  wait: true,
  modelOptions: { texture_quality: 'detailed' },
})

console.log(bronze.url) // The statue, in bronze
```

Next to the mesh, send one of these:

- A text.
- A text and one style image.
- One image, or 2 to 4 views in the order front, left, back, right, with no text.
- Nothing. Tripo then paints a mesh that Tripo made again. Tripo rejects a mesh of your own with no text and no image.

The default model is `'v3.5-20260815'`. `texture_quality: 'extreme'` makes 8K textures and costs more.

### Convert the file format

`convert` writes the model in a new format. `format` is required:

```ts
import { generate3dModel } from '@tanstack/ai'
import { tripo3dModel } from '@tanstack/ai-tripo'

const fbx = await generate3dModel({
  adapter: tripo3dModel('convert'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'url', value: 'https://example.com/models/statue.glb' },
    },
  ],
  threadId: 'statue',
  wait: true,
  modelOptions: { format: 'FBX', fbx_preset: 'blender', pivot_to_center_bottom: true },
})

console.log(fbx.format, fbx.url) // 'fbx' and the link
```

`format` takes `'GLTF'`, `'FBX'`, `'USDZ'`, `'OBJ'`, `'STL'`, and `'3MF'`. `quad: true` makes a quad mesh and always writes FBX.

### Reduce the face count

`decimate` makes a model with fewer faces. The `'v3.0'` model can also unwrap the UVs in the same job:

```ts
import { generate3dModel } from '@tanstack/ai'
import { tripo3dModel } from '@tanstack/ai-tripo'

const lowPoly = await generate3dModel({
  adapter: tripo3dModel('decimate', 'v3.0'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: 'your-tripo-task-id', provider: 'tripo' },
    },
  ],
  threadId: 'statue',
  wait: true,
  modelOptions: { face_limit: 3_000, smart_uv: true },
})

console.log(lowPoly.url) // The statue with about 3,000 faces
```

The models are `'v1.0'`, `'v2.0'` (the default), and `'v3.0'`. From `'v2.0'`, `bake` puts the textures on the low-poly model. `bake` is on by default.

### Unwrap the UVs

`uv` makes a new UV layout and bakes the textures onto it:

```ts
import { generate3dModel } from '@tanstack/ai'
import { tripo3dModel } from '@tanstack/ai-tripo'

const unwrapped = await generate3dModel({
  adapter: tripo3dModel('uv'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'url', value: 'https://example.com/models/statue.glb' },
    },
  ],
  threadId: 'statue',
  wait: true,
})

const layout = unwrapped.files?.find((file) => file.role === 'texture')
console.log(unwrapped.url, layout?.url) // The model, and an image of the UV layout
```

The mesh can have at most 80,000 triangles. A quad counts as two triangles.

### Split a model into parts

`segment` splits a model into parts. The `'v2.0-20260430'` model lets you set the size of the parts:

```ts
import { generate3dModel } from '@tanstack/ai'
import { tripo3dModel } from '@tanstack/ai-tripo'

const parts = await generate3dModel({
  adapter: tripo3dModel('segment', 'v2.0-20260430'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'file', value: 'your-tripo-task-id', provider: 'tripo' },
    },
  ],
  threadId: 'statue',
  wait: true,
  modelOptions: { segmentation_granularity: 'detailed' },
})

const split = parts.files?.find((file) => file.role === 'part')
console.log(split?.url) // The model, in parts
```

The default model is `'v1.0-20250506'`, which has no options. `segmentation_granularity` takes `'simple'`, `'balanced'`, and `'detailed'`.

## Check your credits

`getTripoBalance()` returns the credits of the account that owns the API key:

```ts
import { getTripoBalance } from '@tanstack/ai-tripo'

const { balance, frozen } = await getTripoBalance()

console.log(balance, frozen)
```

- `balance`: the credits that you can spend.
- `frozen`: the credits that Tripo holds for tasks that still run.

## Check that a model can be rigged

`checkTripoRig()` starts a Tripo rig check, waits for it, and returns the result. The check costs no credits:

```ts
import { checkTripoRig } from '@tanstack/ai-tripo'

const { riggable, rigType } = await checkTripoRig(
  { type: 'file', value: 'your-tripo-task-id', provider: 'tripo' },
  { abortSignal: AbortSignal.timeout(120_000) },
)

if (!riggable) throw new Error('Tripo cannot rig this model.')
console.log(rigType) // For example 'biped' or 'quadruped'
```

What to know:

- The model can be a Tripo task id, a `url` source, or a `data` source.
- `rigType` is the rig type that Tripo recommends. Use it to pick `rig_type` for the `rig` job.
- A `rig_type` other than `'biped'` needs the `'v2.5-20260210'` or `'v3.0-20260909'` rig model.
- The function has no time limit. Pass `abortSignal: AbortSignal.timeout(ms)` to set one.

## Upload a file once

A `data` source goes up to Tripo on each job. To use one file in many jobs, upload it once with `uploadTripoFile()`. Then pass the token as a `file` source:

```ts
import { openAsBlob } from 'node:fs'
import { generate3dModel } from '@tanstack/ai'
import { tripo3dModel, uploadTripoFile } from '@tanstack/ai-tripo'

const file = await openAsBlob('ship.png', { type: 'image/png' })
const token = await uploadTripoFile(file)

const concept = {
  type: 'image',
  source: { type: 'file', value: token, provider: 'tripo' },
} as const

const [detailed, lowPoly] = await Promise.all([
  generate3dModel({
    adapter: tripo3dModel('image-to-model'),
    prompt: [concept],
    threadId: 'ship',
    wait: true,
  }),
  generate3dModel({
    adapter: tripo3dModel('image-to-model', 'P1-20260311'),
    prompt: [concept],
    threadId: 'ship',
    wait: true,
  }),
])

console.log(detailed.url, lowPoly.url)
```

You now have two ships from one upload: a detailed one and a low-poly one.

The file `type` must be one of these MIME types:

- Images: `image/png`, `image/jpeg`, `image/webp`.
- Models: `model/gltf-binary`, `model/gltf+json`, `model/stl`, `model/obj`.

Another MIME type throws before the upload.

## Download the files in time

The links in a Tripo result are signed, and they expire. Download each file that you want to keep soon after the job:

```ts
import { writeFile } from 'node:fs/promises'
import { generate3dModel } from '@tanstack/ai'
import { tripo3dModel } from '@tanstack/ai-tripo'

const chair = await generate3dModel({
  adapter: tripo3dModel('text-to-model'),
  prompt: 'A mid-century wooden lounge chair',
  threadId: 'chair',
  wait: true,
})

const response = await fetch(chair.url)
if (!response.ok) throw new Error(`Download failed: ${chair.url}`)
await writeFile(`chair.${chair.format}`, Buffer.from(await response.arrayBuffer()))
```

What to know:

- `chair.files` has the other links, for example the PBR model. They expire at the same time.
- The task id does not expire in this way. To chain jobs, pass the `jobId`, not the link.
- When you stream to a browser, the browser gets the link. A plain link or a download works. But Tripo sends its files with no CORS header, so a script in the page (`fetch`, three.js, `<model-viewer>`) cannot read the file. Load it through your server, like the `/api/file` route in [Tripo Animated Character](../tutorials/tripo-animated-character).

## Check a job from another request

Without `wait` or `stream`, `generate3dModel()` only submits the job and returns `{ jobId, model }`. Save the id, then read the job in another request with `get3dModelJobStatus()`:

```ts
import { generate3dModel, get3dModelJobStatus } from '@tanstack/ai'
import { tripo3dModel } from '@tanstack/ai-tripo'

// Request 1: submit the job, and save the id
const { jobId } = await generate3dModel({
  adapter: tripo3dModel('rig'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'url', value: 'https://example.com/models/knight.glb' },
    },
  ],
  threadId: 'knight',
})

// Request 2: read the job with an adapter for the same endpoint
const status = await get3dModelJobStatus({
  adapter: tripo3dModel('rig'),
  jobId,
})

if (status.status === 'completed' && status.result) {
  console.log('Ready:', status.result.url)
} else if (status.status === 'failed') {
  console.error(status.error)
} else {
  console.log(status.status, status.progress) // for example 'processing', 40
}
```

The endpoint sets the roles of the result files, for example `'rigged'` for a rig. Use the same endpoint in both requests.

## Errors

- A Tripo response that is not 2xx throws a `TripoApiError`. A 2xx response with a Tripo `code` that is not `0` throws it too.
- A failed task rejects `wait`, and ends a stream with `RUN_ERROR`. The message has the Tripo error text. Tripo gives back the credits.
- A prompt part that the endpoint cannot use throws before the request and before any upload.

`TripoApiError` has these fields:

- `status`: the HTTP status.
- `code`: the Tripo error code, for example `2010` for too few credits.
- `suggestion`: the fix that Tripo suggests, when Tripo sends one.

The adapter repeats a status request on 408, 409, 429, and 5xx. It never repeats a create request or an upload, so one call cannot charge twice.

```ts
import { generate3dModel } from '@tanstack/ai'
import { TripoApiError, tripo3dModel } from '@tanstack/ai-tripo'

try {
  const model = await generate3dModel({
    adapter: tripo3dModel('text-to-model'),
    prompt: 'A wooden barrel, game asset',
    threadId: 'barrel',
    wait: true,
  })
  console.log(model.url)
} catch (error) {
  if (error instanceof TripoApiError) {
    console.error('Tripo answered', error.status, error.code, error.message)
    if (error.suggestion) console.error('Tripo suggests:', error.suggestion)
  } else if (error instanceof Error) {
    console.error(error.message)
  }
}
```

## Bring your own key

`tripoByok` from `@tanstack/ai-tripo/byok` declares Tripo for the BYOK store, with `TRIPO_API_KEY` as its env var. On the server, pass the key as `apiKey` in the last argument of `tripo3dModel()` or of a helper. See [Bring Your Own Key](../advanced/byok).

## API reference

| Export | What it does |
| --- | --- |
| `tripo3dModel(endpoint, model?, config?)` | Creates a 3D model adapter for `generate3dModel()` |
| `getTripoBalance(options?)` | Returns the credit balance |
| `checkTripoRig(source, options?)` | Checks if Tripo can rig a model, and returns the rig type |
| `uploadTripoFile(file, options?)` | Uploads a file, and returns its file token |
| `TripoApiError` | The error for a failed Tripo request |
| `DEFAULT_TRIPO_GENERATION_MODEL` | The generation model when you give none: `'v3.1-20260211'` |

The `config` fields, also accepted by the helpers:

- `apiKey`: the Tripo API key. The default is `TRIPO_API_KEY`.
- `baseUrl`: the API base URL. The default is `https://openapi.tripo3d.ai/v3`. For China, use `https://openapi.tripo3d.com/v3`.
- `headers`: extra request headers.
- `fetch`: your own `fetch` function.
