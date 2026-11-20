---
title: 3D Model Generation
id: 3d-model-generation
order: 7.5
description: "Turn a concept image or a text prompt into a GLB file with generate3dModel() and fal.ai or Meshy. Show the job status while it runs, then load the model in your app."
keywords:
  - tanstack ai
  - 3d model generation
  - generate3dModel
  - useGenerate3dModel
  - image-to-3d
  - text-to-3d
  - glb
  - gltf
  - hunyuan3d
  - meshy
  - tripo
  - trellis
  - fal
  - game assets
  - experimental
---

`generate3dModel()` turns a concept image or a text prompt into a 3D model file, for example a GLB. The job runs on the provider for a few minutes. With `stream: true`, the browser gets status updates, then the URL of the model.

> [!WARNING]
> 3D model generation is experimental. The API can change in a minor release. fal bills each 3D job, and the price depends on the model.

To build a full app that turns one line of text into a game-ready model, follow the [Game Asset Pipeline](../tutorials/game-asset-pipeline) tutorial.

## Make your first model

You need a React app with a server route, a fal.ai API key, and the URL of a concept image. The setup takes about 10 minutes. Each model takes a few minutes.

1. Install the packages. The viewer in step 4 uses three.js:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-fal three

<!-- ::end:tabs -->

<!-- ::start:tabs variant="package-manager" mode="dev-install" -->

react: @types/three

<!-- ::end:tabs -->

2. Put your key in `.env`:

```bash
FAL_KEY=your-fal-api-key
```

3. Add a `POST` route at `/api/generate/3d-model`:

```typescript
import {
  generate3dModel,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'

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

  const stream = generate3dModel({
    adapter: fal3dModel('fal-ai/hunyuan-3d/v3.1/pro/image-to-3d'),
    prompt: images,
    threadId,
    stream: true,
    abortSignal: request.signal,
  })
  return toServerSentEventsResponse(stream)
}
```

The route keeps only the image part. This model takes one image and no text.

4. Add a small viewer for the GLB file:

```tsx ignore
// GlbViewer.tsx
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export function GlbViewer({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 3))
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
    camera.position.set(0, 1, 3)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(480, 480)
    host.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)

    new GLTFLoader().load(url, (gltf) => {
      // Put the center of the model at the origin.
      const box = new THREE.Box3().setFromObject(gltf.scene)
      gltf.scene.position.sub(box.getCenter(new THREE.Vector3()))
      scene.add(gltf.scene)
    })

    renderer.setAnimationLoop(() => {
      controls.update()
      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      controls.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
    }
  }, [url])

  return <div ref={hostRef} />
}
```

Any glTF viewer works, for example `<model-viewer>`. A game engine loads the same file.

5. Call the route from a component, and show the model:

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useGenerate3dModel } from '@tanstack/ai-react'
import { GlbViewer } from './GlbViewer'

const conceptUrl = 'https://example.com/concept/treasure-chest.png'

export function ModelGenerator() {
  const [jobState, setJobState] = useState<string>()
  const { generate, result, isLoading, error, stop } = useGenerate3dModel({
    connection: fetchServerSentEvents('/api/generate/3d-model'),
    threadId: 'treasure-chest',
    onProgress: (_progress, message) => setJobState(message),
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
        {isLoading ? 'Generating...' : 'Generate model'}
      </button>

      {isLoading && (
        <div>
          <p>Status: {jobState ?? 'starting...'}</p>
          <button onClick={stop}>Cancel</button>
        </div>
      )}

      {error && <p role="alert">Error: {error.message}</p>}

      {result && (
        <div>
          <GlbViewer url={result.url} />
          <a href={result.url}>Open the .{result.format} file</a>
        </div>
      )}
    </div>
  )
}
```

Click **Generate model**. The status changes from `pending` to `processing`. After a few minutes, the chest shows in the viewer. Drag to turn it, and scroll to zoom.

## How it works

A 3D model is a job on the provider:

1. **Create a job.** fal takes the prompt and returns a job id.
2. **Poll the job.** The server asks fal for the status until the job is done or fails.
3. **Get the model.** When the job is done, the adapter reads the file URLs.

With `stream: true`, `generate3dModel()` does all three steps on the server. It sends these events:

- `generation:progress` after each poll. The value is `{ progress, message }`. The hook calls `onProgress(progress, message)`.
- `generation:result` when the model is ready. The hook sets `result`.

`message` is the job state: `'pending'`, `'processing'`, or `'completed'`. fal does not report a percentage, so `progress` is `0` until the job is done, then `100`.

By default, the server polls every 2 seconds and stops after 10 minutes. Set `pollInterval` and `timeout` (both in milliseconds) to change this:

```typescript
import { generate3dModel } from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'

const stream = generate3dModel({
  adapter: fal3dModel('fal-ai/hunyuan3d-v3/text-to-3d'),
  prompt: 'A low-poly wooden treasure chest with iron bands',
  threadId: 'thread-1',
  stream: true,
  pollInterval: 5000,
  timeout: 900_000,
})
```

On a timeout or an abort, `generate3dModel()` asks fal to cancel the job. fal can refuse to cancel a job that already runs. The route in step 3 passes `request.signal`, so a closed browser request also cancels the job.

The hook has no `jobId` or status value. Read the job state in `onProgress`. The other hook options are in [Generation Hooks](./generation-hooks#usegenerate3dmodel).

## Start from text

Use a text-to-3D model and send a plain string:

```typescript
import { generate3dModel } from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'

const model = await generate3dModel({
  adapter: fal3dModel('fal-ai/hunyuan-3d/v3.1/pro/text-to-3d'),
  prompt: 'A stylized wooden treasure chest with iron bands, game asset',
  threadId: 'thread-1',
  wait: true,
})

console.log(model.url) // The GLB file
```

`wait: true` runs the full job and returns the model. If no browser waits for the stream, use it on the server.

## Pick a model

Swap the id in `fal3dModel()`. The adapter reads `FAL_KEY` from the environment.

| Model | Input | Use it for |
| --- | --- | --- |
| `fal-ai/hunyuan-3d/v3.1/pro/image-to-3d` | One image | Detailed props and scenery from concept art, with PBR materials |
| `fal-ai/hunyuan3d-v3/image-to-3d` | One image | Low-poly meshes (`generate_type: 'LowPoly'`) |
| `meshy/v7.1/image-to-3d` | One image | Game props and characters: quad topology, rigging, and animation |
| `tripo3d/tripo/v2.5/image-to-3d` | One image | Clean meshes with a face limit |
| `fal-ai/hunyuan-3d/v3.1/pro/text-to-3d` | Text | A model when you have no concept image |

The full list, and the models that take a mesh as input, are in the [fal adapter](../adapters/fal#3d-model-endpoints).

To call the Meshy API with your own Meshy key, use `meshy3dModel()` from `@tanstack/ai-meshy`. It reads `MESHY_API_KEY`:

```typescript
import { meshy3dModel } from '@tanstack/ai-meshy'

const adapter = meshy3dModel('image-to-3d', 'meshy-7.1')
```

The Meshy adapter also does these things:

- It chains jobs from a Meshy task id, so a mesh goes to rigging and animation with no upload.
- It prepares a model for a 3D printer, and returns a 3MF file for a multi-color print.

See [Meshy](../adapters/meshy).

TypeScript narrows the prompt for each model. For example, a `model3d` part on an image-to-3D model is a compile error.

## Options

Each model has its own `modelOptions`. Write the model id as a string literal, and TypeScript completes them:

```typescript
import { generate3dModel } from '@tanstack/ai'
import { fal3dModel } from '@tanstack/ai-fal'

const conceptUrl = 'https://example.com/concept/treasure-chest.png'

const model = await generate3dModel({
  adapter: fal3dModel('fal-ai/hunyuan-3d/v3.1/pro/image-to-3d'),
  prompt: [{ type: 'image', source: { type: 'url', value: conceptUrl } }],
  threadId: 'thread-1',
  wait: true,
  modelOptions: {
    face_count: 40_000, // fewer faces for a game prop
    enable_pbr: true, // metallic, roughness, and normal maps
  },
})
```

More options for popular models:

- **Hunyuan3D v3**: `generate_type` (`'Normal'`, `'LowPoly'`, or `'Geometry'`), `face_count`, `enable_pbr`, and `polygon_type` (only with `'LowPoly'`).
- **Meshy 7.1**: `topology` (`'quad'` or `'triangle'`), `target_polycount`, `should_remesh`, `enable_pbr`, and `texture_image_url` (an image that guides the textures). The rigging options are in [Rig and animate a character](./3d-model-generation-advanced#rig-and-animate-a-character).
- **Tripo v2.5**: `face_limit`, `quad`, `pbr`, and `texture` (`'no'`, `'standard'`, or `'HD'`).

The options of `generate3dModel()`:

| Option | Type | Description |
| --- | --- | --- |
| `adapter` | `Model3dAdapter` | The 3D adapter and model (required) |
| `prompt` | `string \| MediaPromptPart[]` | Text, or an array of text, image, and `model3d` parts (required) |
| `threadId` | `string` | A stable id for this generation (required) |
| `modelOptions` | `object` | Options for this model only |
| `stream` | `boolean` | `true` runs the full job and returns events for SSE |
| `wait` | `boolean` | `true` runs the full job and returns the model. Do not use it with `stream`. |
| `pollInterval` | `number` | Milliseconds between polls. Default `2000`. |
| `timeout` | `number` | Milliseconds before the run stops. Default `600000` with `stream` or `wait`. |
| `abortSignal` | `AbortSignal` | Stops the run and cancels the job |

## The result

`result` on the hook, and the return value of `wait: true`, is a `Model3dResult`:

```typescript
import type { TokenUsage } from '@tanstack/ai'

interface Model3dResult {
  jobId: string
  url: string // the main file, a GLB when there is one
  format: 'glb' | 'gltf' | 'fbx' | 'obj' | 'usdz' | 'stl' | '3mf'
  files?: Array<{
    url: string
    format?: 'glb' | 'gltf' | 'fbx' | 'obj' | 'usdz' | 'stl' | '3mf' // not set on textures
    role?: 'base' | 'pbr' | 'rigged' | 'animation' | 'texture' | 'part'
    contentType?: string
  }>
  previewImageUrl?: string // a render of the model, when fal makes one
  usage?: TokenUsage
}
```

What to read:

- `url` is the file to load. The adapter picks the PBR GLB first, then the base GLB.
- `files` holds every mesh file that fal returned, with its format. `role` tells you what each file holds, for example `'rigged'` for a mesh with a skeleton.
- Texture files are also in `files`, with the role `'texture'`. They have no `format`. Read `contentType` to get the image type.
- `previewImageUrl` is good for a thumbnail in a list.

fal file URLs can expire. To keep a model, download the file and store it yourself.

A full app is in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media).

## Advanced

A server pipeline from concept art to a textured game asset, rigged characters, your own polling, and errors are in [3D Model Generation: Advanced](./3d-model-generation-advanced).
