---
title: "Meshy: Advanced"
id: meshy-advanced
description: "Remesh, convert, resize, and UV unwrap a model with Meshy in TanStack AI. Check printability, repair, color, and split a model for a 3D printer. Read jobs from another request, cancel jobs, and bring your own key."
keywords:
  - tanstack ai
  - meshy
  - 3d printing
  - 3mf
  - remesh
  - printability
  - generate3DModel
  - get3DModelJobStatus
  - adapter
---

Pass a model that you already have to a Meshy endpoint, for example `meshy3DModel('print-repair')`. You get back a changed model: a new topology, new formats, or a file that is ready for your printer. To make a first model, start at [Meshy](./meshy).

## Change a model

A mesh is a `model3d` part. Use a Meshy task id to change the result of an earlier job. Use a URL to change a file of your own:

```ts
import { generate3DModel } from '@tanstack/ai'
import { meshy3DModel } from '@tanstack/ai-meshy'

const remeshed = await generate3DModel({
  adapter: meshy3DModel('remesh'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'url', value: 'https://example.com/models/statue.glb' },
    },
  ],
  threadId: 'statue',
  wait: true,
  modelOptions: {
    topology: 'quad',
    target_polycount: 5_000,
    target_formats: ['glb', 'fbx'],
  },
})

console.log(remeshed.url) // The GLB with 5,000 quad faces
```

The four endpoints that change a model:

| Endpoint | What it changes | Main `modelOptions` |
| --- | --- | --- |
| `remesh` | The topology and the polygon count | `topology`, `target_polycount`, `target_formats` |
| `convert` | Only the file formats | `target_formats` (required) |
| `resize` | The real-world size, in meters | `resize_height`, `resize_longest_side`, `auto_size`, `origin_at` |
| `uv-unwrap` | The UV layout | None |

`target_formats` takes `'glb'`, `'obj'`, `'fbx'`, `'stl'`, `'usdz'`, `'3mf'`, and `'blend'`. A `.blend` file is in `files` with no `format`. Ask for `'blend'` together with a mesh format. With `'blend'` alone, `remesh` and `convert` throw before the request, because the result has no mesh file.

These endpoints take no text and no images. TypeScript stops an image part. A text part type-checks, but the adapter throws before it starts the job.

## Prepare a model for a 3D printer

Start from a model that Meshy made, for example an `image-to-3d` job. Then:

1. Check the model with `analyzeMeshyPrintability()`.
2. Pick one way to print it:
   - `print-repair`: a repaired mesh for a 1-color print.
   - `print-multi-color`: a 3MF file in a few colors.
   - `print-split`: the model cut into parts that fit your printer.

What each print step takes:

- `print-repair`: a URL, an inline GLB or glTF, or a Meshy task id.
- `print-multi-color`: a URL to a GLB or FBX, an inline GLB, or the task id of a Meshy model. A `print-repair` job is not a Meshy model here.
- `print-split`: only the task id of a Meshy model from `meshy-6` or `meshy-7`. Models from `meshy-t2` or `meshy-t2.5` do not work.

### Check the model first

`analyzeMeshyPrintability()` starts a Meshy analysis, waits for it, and returns the report. The analysis costs no credits:

```ts
import { analyzeMeshyPrintability } from '@tanstack/ai-meshy'

const report = await analyzeMeshyPrintability({
  model: { type: 'url', value: 'https://example.com/models/dragon.glb' },
  printerType: 'fdm',
  intendedPrintHeightMm: 120,
  abortSignal: AbortSignal.timeout(120_000),
})

console.log(report.status) // 'healthy', 'warning', 'error', or 'unknown'
console.log(report.metrics?.is_watertight, report.metrics?.holes)
console.log(report.thin_walls?.has_thin_walls)
```

What to know:

- `model` can be one of these:
  - A `url` source: GLB, glTF, OBJ, FBX, or STL.
  - A `data` source: GLB or glTF only.
  - A Meshy task id as a `file` source.
- With `printerType`, a print size, or both, Meshy also checks the wall thickness. That check takes about 10 seconds. Without them, the analysis takes about 1 second.
- Set `intendedPrintHeightMm` or `intendedPrintLongestSideMm`, not both. With a printer type but no size, Meshy uses its default size.
- The function has no time limit. Pass `abortSignal: AbortSignal.timeout(ms)` to set one.

### Repair, color, and split

This script makes a dragon figure from a concept image. Then it repairs the figure, makes a 4-color 3MF file, and cuts the figure into parts. Each print step reads the Meshy figure, so the three steps are independent:

```ts
import { writeFile } from 'node:fs/promises'
import { generate3DModel } from '@tanstack/ai'
import { meshy3DModel } from '@tanstack/ai-meshy'

const threadId = 'dragon-figure'

const figure = await generate3DModel({
  adapter: meshy3DModel('image-to-3d', 'meshy-7.1'),
  prompt: [
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/concepts/dragon.png' },
    },
  ],
  threadId,
  wait: true,
  timeout: 30 * 60_000,
})
const meshyFigure = {
  type: 'model3d',
  source: { type: 'file', value: figure.jobId, provider: 'meshy' },
} as const

const repaired = await generate3DModel({
  adapter: meshy3DModel('print-repair'),
  prompt: [meshyFigure],
  threadId,
  wait: true,
  modelOptions: { printer_type: 'fdm', intended_print_height_mm: 120 },
})

const colored = await generate3DModel({
  adapter: meshy3DModel('print-multi-color'),
  prompt: [meshyFigure],
  threadId,
  wait: true,
  modelOptions: { max_colors: 4, printer_brand: 'bambu' },
})

const response = await fetch(colored.url)
if (!response.ok) throw new Error(`Download failed: ${colored.url}`)
await writeFile('dragon.3mf', Buffer.from(await response.arrayBuffer()))

const parts = await generate3DModel({
  adapter: meshy3DModel('print-split'),
  prompt: [meshyFigure, { type: 'text', content: 'head, wings, body, tail' }],
  threadId,
  wait: true,
  modelOptions: { mode: 'by_parts', layout: 'on_plate', connectors: true },
})

console.log(repaired.url)
console.log(parts.files?.map((file) => file.url))
```

Run the script. You now have `dragon.3mf` on disk, with a slicer preset for a Bambu printer. Open it in your slicer.

What each step does:

- `print-repair` repairs the mesh for a 1-color print. `printer_type` sets the minimum wall thickness.
- `print-multi-color` returns a 3MF file. `colored.format` is `'3mf'`. `max_colors` is 1 to 16.
- `print-split` takes the model only as a Meshy task id. With `mode: 'by_parts'` or `'by_color'`, the text names the parts. With `mode: 'auto'`, Meshy picks the cuts and you send no text.
- An inline mesh for `print-repair` must be GLB or glTF, and for `print-multi-color` it must be GLB. Send other formats as a `url` source.

Meshy keeps generated files for 3 days, on all plans except Enterprise. Copy each file that you want to keep.

### Make a relief from a photo

`relief` carves a photo into a plaque. It takes one image part:

```ts
import { generate3DModel } from '@tanstack/ai'
import { meshy3DModel } from '@tanstack/ai-meshy'

const plaque = await generate3DModel({
  adapter: meshy3DModel('relief'),
  prompt: [
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/photos/dog.jpg' },
    },
  ],
  threadId: 'dog-plaque',
  wait: true,
  modelOptions: { size_mm: 120, carving_mode: 'emboss', base_thickness_mm: 3 },
})

const stl = plaque.files?.find((file) => file.format === 'stl')
console.log(stl?.url) // The STL for your slicer
```

By default, Meshy makes a GLB and an STL. `size_mm` is the longer side of the photo, from 20 to 250 millimeters. Set `carving_mode: 'engrave'` to cut the near parts in.

## Check your credits

`getMeshyBalance()` returns the credits of the account that owns the API key:

```ts
import { getMeshyBalance } from '@tanstack/ai-meshy'

const { balance, monthlyCredits, permanentCredits, monthlyResetsAt } =
  await getMeshyBalance()

console.log(balance, monthlyCredits, permanentCredits, monthlyResetsAt)
```

`monthlyCredits` expire at `monthlyResetsAt`. `permanentCredits` do not expire. `monthlyResetsAt` is not set when the account has no monthly refresh.

## Find an animation

`listMeshyAnimations()` lists the actions in the Meshy animation library. It costs no credits:

```ts
import { listMeshyAnimations } from '@tanstack/ai-meshy'

const swings = await listMeshyAnimations({ search: 'sword' })

for (const action of swings) {
  console.log(action.actionId, action.name, action.rigType, action.previewUrl)
}
```

The filters are `search`, `category`, `subCategory`, and `actionIds`. Every filter that you set must match. Pass `actionId` as `modelOptions.action_id` to `meshy3DModel('animation')`. A biped rig takes only biped actions.

## Check a job from another request

Without `wait` or `stream`, `generate3DModel()` only submits the job and returns `{ jobId, model }`. Save the id, then read the job in another request with `get3DModelJobStatus()`:

```ts
import { generate3DModel, get3DModelJobStatus } from '@tanstack/ai'
import { meshy3DModel } from '@tanstack/ai-meshy'

// Request 1: submit the job, and save the id
const { jobId } = await generate3DModel({
  adapter: meshy3DModel('rigging'),
  prompt: [
    {
      type: 'model3d',
      source: { type: 'url', value: 'https://example.com/models/knight.glb' },
    },
  ],
  threadId: 'knight',
})

// Request 2: read the job with an adapter for the same endpoint
const status = await get3DModelJobStatus({
  adapter: meshy3DModel('rigging'),
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

The endpoint sets the Meshy URL of the task, so use the same endpoint in both requests. For a motion job, call `getMotionJobStatus()` with `meshyMotion()` in the same way.

## Cancel a job

Meshy cancels only a task that waits in the queue (`'pending'`). Then Meshy gives back the credits. The adapter reads the task first and cancels only a `'pending'` task.

```ts
import { meshy3DModel } from '@tanstack/ai-meshy'

const adapter = meshy3DModel('image-to-3d', 'meshy-7.1')

try {
  await adapter.cancel3DModelJob('your-task-id')
} catch (error) {
  if (error instanceof Error) console.error(error.message)
}
```

What to know:

- For a running task, the cancel throws `Meshy task <id> is already running and cannot be canceled`. The task finishes, and Meshy charges for it.
- For a finished task, the cancel does nothing. The model and its files stay.
- A task can finish between the read and the cancel request. Then Meshy deletes the finished model. This window is one request long, so it is rare.
- `cancelMotionJob()` from `@tanstack/ai` works in the same way for `meshyMotion()` jobs.
- With `stream` or `wait`, an abort or a `timeout` also asks Meshy to cancel. If the task already runs, the failed cancel goes to the error log.

## Errors

- A Meshy response that is not 2xx throws a `MeshyApiError`. `error.status` is the HTTP status.
- A failed task rejects `wait`, and ends a stream with `RUN_ERROR`. The message has the Meshy error text.
- A prompt part that the endpoint cannot use throws before the request.

The adapter repeats a status request on 408, 409, 429, and 5xx. It never repeats a create request, so one call cannot charge twice.

```ts
import { generate3DModel } from '@tanstack/ai'
import { MeshyApiError, meshy3DModel } from '@tanstack/ai-meshy'

try {
  const model = await generate3DModel({
    adapter: meshy3DModel('text-to-3d-preview', 'meshy-7.1'),
    prompt: 'A wooden barrel, game asset',
    threadId: 'barrel',
    wait: true,
  })
  console.log(model.url)
} catch (error) {
  if (error instanceof MeshyApiError) {
    console.error('Meshy answered', error.status, error.message)
  } else if (error instanceof Error) {
    console.error(error.message)
  }
}
```

## Bring your own key

`meshyByok` from `@tanstack/ai-meshy/byok` declares Meshy for the BYOK store, with `MESHY_API_KEY` as its env var. On the server, pass the key that you read as `apiKey` in the last argument of `meshy3DModel()` or `meshyMotion()`. See [Bring Your Own Key](../advanced/byok).

## API reference

| Export | What it does |
| --- | --- |
| `meshy3DModel(endpoint, aiModel?, config?)` | Creates a 3D model adapter for `generate3DModel()` |
| `meshyMotion(mode, config?)` | Creates a motion adapter for `generateMotion()`. `mode` is `'prime'` or `'swift'`. |
| `analyzeMeshyPrintability(options)` | Checks if a model can be printed, and returns the report |
| `getMeshyBalance(options?)` | Returns the credit balance |
| `listMeshyAnimations(options?)` | Lists the actions in the animation library |
| `MeshyApiError` | The error for a Meshy response that is not 2xx |

The `config` fields, also accepted by the helpers:

- `apiKey`: the Meshy API key. The default is `MESHY_API_KEY`.
- `baseUrl`: the API base URL. The default is `https://api.meshy.ai/openapi`.
- `headers`: extra request headers.
- `fetch`: your own `fetch` function.
