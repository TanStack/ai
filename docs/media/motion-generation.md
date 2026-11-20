---
title: Motion Generation
id: motion-generation
order: 7.5
description: "Make a skeletal animation clip (FBX) from a prompt with generateMotion(). Download it and import it into Unity, Unreal, Godot, or Blender. Works with fal Hunyuan Motion, Uthana, and Meshy."
keywords:
  - tanstack ai
  - motion generation
  - generateMotion
  - getMotionJobStatus
  - cancelMotionJob
  - animation
  - fbx
  - hunyuan motion
  - fal
  - uthana
  - meshy
  - game assets
  - experimental
---

You need an attack clip for a character, and keyframing it by hand takes hours. `generateMotion()` turns a prompt into a skeletal animation file. You download the FBX and import it into your engine.

> [!WARNING]
> Motion generation is experimental. The API can change. The provider bills for each generation.

## Generate an FBX clip

This script makes an orc axe attack and saves the FBX next to the script. It takes about 5 minutes. The clip itself takes from seconds to a few minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-fal
vue: @tanstack/ai @tanstack/ai-fal
solid: @tanstack/ai @tanstack/ai-fal
svelte: @tanstack/ai @tanstack/ai-fal
preact: @tanstack/ai @tanstack/ai-fal
angular: @tanstack/ai @tanstack/ai-fal
vanilla: @tanstack/ai @tanstack/ai-fal
octane: @tanstack/ai @tanstack/ai-fal

<!-- ::end:tabs -->

2. Put your fal key in `.env`. Get one at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).

```bash
FAL_KEY=your-fal-key
```

3. Add this script. It submits the job, checks it every 2 seconds, then downloads each file:

```ts
import { writeFile } from 'node:fs/promises'
import { generateMotion, getMotionJobStatus } from '@tanstack/ai'
import { falMotion } from '@tanstack/ai-fal'

const adapter = falMotion('fal-ai/hunyuan-motion')

const { jobId } = await generateMotion({
  adapter,
  threadId: 'orc-attacks',
  prompt:
    'A heavy orc warrior raises a two-handed axe overhead and slams it down',
  duration: 3,
})

let status = await getMotionJobStatus({ adapter, jobId })
while (status.status === 'pending' || status.status === 'processing') {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  status = await getMotionJobStatus({ adapter, jobId })
}

if (!status.motion) {
  throw new Error(status.error ?? 'Motion generation failed')
}

for (const asset of status.motion.assets) {
  const response = await fetch(asset.url)
  if (!response.ok) throw new Error(`Download failed: ${asset.url}`)
  const fileName = asset.fileName ?? `orc-attack.${asset.format}`
  await writeFile(fileName, Buffer.from(await response.arrayBuffer()))
  console.log(`Saved ${fileName}`)
}
```

4. Run the script. Then import the FBX into your engine.

You now have an FBX attack clip on disk, ready for your engine.

## Import the clip into your engine

The FBX holds a humanoid skeleton and its animation. Clip length and frame rate are inside the file.

- **Retarget the clip.** The fal docs do not name the skeleton. The files hold an SMPL-H skeleton (52 bones, root bone `Pelvis`) at 30 fps, with root motion in the `Pelvis` bone. Retarget the clip to your rig in your engine, for example with the Humanoid rig type in Unity or the IK Retargeter in Unreal.
- **You cannot send your own rig.** fal takes no character or skeleton input.
- **The clip has no weapon.** Your engine attaches the axe to the hand bone. The prompt can describe the hands, for example "a two-handed grip".
- **Keep the files.** fal file URLs expire after the media expiry time in your fal account. Download each file and store it with your game assets.

## Use your own character

A fal clip is on fal's skeleton, so you retarget it in your engine. Uthana can make the clip on your own character:

1. Upload a humanoid FBX or GLB with `createUthanaCharacter()` from `@tanstack/ai-uthana`.
2. Pass the character id as `modelOptions.character_id` to `uthanaMotion()`.

See [Uthana: use your own character](../adapters/uthana#use-your-own-character).

Meshy puts a `meshyMotion()` clip on a character that Meshy rigged. See [Meshy: put the clip on your rig](../adapters/meshy#put-the-clip-on-your-rig).

## What you get back

The result has only what the provider returns. fal returns the files, the seed, and the billed units.

`MotionGenerationResult`:

| Field | What it is |
| --- | --- |
| `jobId` | The provider job id |
| `model` | The model that made the clip |
| `assets` | Every file the provider returned |
| `seed` | The seed the provider used. Send it again in `modelOptions` to repeat a take. |
| `usage` | Billing usage, when the adapter can read it |

Each `MotionAsset`:

| Field | What it is |
| --- | --- |
| `url` | Download URL. It can expire. |
| `format` | `'fbx'`, `'bvh'`, `'glb'`, `'gltf'`, `'json'`, or the name the provider uses |
| `contentType`, `fileName`, `fileSize` | Set when the provider reports them |
| `expiresAt` | When `url` stops working, if the provider reports it |

fal does not return clip length, frame rate, skeleton names, root motion, or contact timing. If your game needs an impact time, you author it.

## Build an ability from two clips

A "Leap Slam" needs two clips: the orc attack, and the enemy reaction. Make each one with its own `generateMotion()` call. Then link them in a manifest that your game reads:

```json
{
  "ability": "orc-leap-slam",
  "attacker": { "clip": "orc-leap-slam.fbx", "seed": 1234 },
  "reactions": [{ "clip": "enemy-knockdown.fbx", "trigger": "impact" }],
  "events": [{ "name": "impact", "timeSeconds": 1.6, "source": "authored" }],
  "effects": ["shockwave", "dust", "ground-cracks", "flying-rocks"]
}
```

A designer sets `timeSeconds` after a preview of the attack clip. The provider does not return it.

Your engine does the rest:

- It retargets both clips to your rigs and attaches the axe.
- It lines up the two-handed grip, blends the clips, and places the characters.
- When the impact event fires, it applies damage and plays the reaction.
- It spawns the shockwave, dust, cracks, and rocks, and plays the audio and camera shake.

The [Generate Motion tutorial](../tutorials/generate-motion) builds this page in React, with the manifest.

## Show the job in a browser

Pass `stream: true`. The server then submits the job, checks it, and streams each status to the browser.

Server route at `/api/generate/motion`:

```ts
import {
  generateMotion,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { falMotion } from '@tanstack/ai-fal'

export async function POST(request: Request) {
  const { input, threadId, runId } = await generationParamsFromRequest(
    'motion',
    request,
  )
  if (typeof input.prompt !== 'string') {
    return new Response('Send a text prompt.', { status: 400 })
  }

  const stream = generateMotion({
    adapter: falMotion('fal-ai/hunyuan-motion'),
    prompt: input.prompt,
    duration: typeof input.duration === 'number' ? input.duration : undefined,
    stream: true,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream)
}
```

React component. There is no motion hook, so use the generic `useGeneration` hook with `MotionGenerationResult`:

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useGeneration } from '@tanstack/ai-react'
import type { MotionGenerationResult } from '@tanstack/ai'

type MotionInput = { prompt: string; duration: number }

export function MotionClip() {
  const [jobStatus, setJobStatus] = useState('Not started')
  const { generate, result, isLoading, error } = useGeneration<
    MotionInput,
    MotionGenerationResult
  >({
    connection: fetchServerSentEvents('/api/generate/motion'),
    threadId: 'orc-leap-slam',
    onChunk: (chunk) => {
      if (chunk.type !== 'CUSTOM' || chunk.name !== 'motion:status') return
      const value: unknown = chunk.value
      if (
        typeof value === 'object' &&
        value !== null &&
        'status' in value &&
        typeof value.status === 'string'
      ) {
        setJobStatus(value.status)
      }
    },
  })
  const fbx = result?.assets.find((asset) => asset.format === 'fbx')

  return (
    <div>
      <button
        onClick={() =>
          generate({ prompt: 'An orc swings a two-handed axe', duration: 4 })
        }
        disabled={isLoading}
      >
        Generate
      </button>
      <p>Status: {jobStatus}</p>
      {error ? <p role="alert">{error.message}</p> : null}
      {fbx ? <a href={fbx.url}>Download FBX</a> : null}
    </div>
  )
}
```

The stream sends these events:

| Event | When | Value |
| --- | --- | --- |
| `RUN_STARTED` | The run starts | |
| `CUSTOM` `motion:job:created` | The provider accepted the job | `{ jobId, model }` |
| `CUSTOM` `motion:status` | After each status check | `{ jobId, status, progress?, queuePosition?, error? }` |
| `CUSTOM` `generation:result` | The files are ready | `MotionGenerationResult` |
| `RUN_FINISHED` | The run ends | |

`status` is `'pending'`, `'processing'`, `'completed'`, or `'failed'`. If the job fails, the stream sends `RUN_ERROR`. `generation:progress` comes only when the provider reports a real number. fal does not.

Stream options:

- `pollingInterval`: the time between status checks. The default is 2000 ms.
- `maxDuration`: the longest time the stream waits. After that, the stream sends `RUN_ERROR` and the job keeps running. The default is 600000 ms (10 minutes).

## Stop and cancel

Stop and cancel are two different things:

- **Stop watching.** `abortSignal`, `timeout`, or a closed stream stops the local work only. The provider job keeps running, and you still pay for it.
- **Cancel on the provider.** `cancelMotionJob()` asks the provider to stop the job.

```ts
import { cancelMotionJob } from '@tanstack/ai'
import { falMotion } from '@tanstack/ai-fal'

await cancelMotionJob({
  adapter: falMotion('fal-ai/hunyuan-motion'),
  jobId: 'the-job-id',
})
```

On fal:

- fal removes a job that waits in the queue.
- A job that already runs gets the cancel request, but it can still finish.
- fal refuses a cancel for a job that is complete. Then `cancelMotionJob()` throws.

If an adapter has no cancel API, `cancelMotionJob()` throws.

## Let an agent make clips

An agent can make clips with two tools. One tool starts a job, and one tool checks it. A clip takes from seconds to minutes, so the agent starts the job, keeps working, and checks later.

```ts
// tools.ts
import {
  generateMotion,
  getMotionJobStatus,
  toolDefinition,
} from '@tanstack/ai'
import { falMotion } from '@tanstack/ai-fal'
import { z } from 'zod'

const motionAdapter = falMotion('fal-ai/hunyuan-motion')

export const generateMotionClip = toolDefinition({
  name: 'generate_motion_clip',
  description:
    'Start a skeletal animation clip for a humanoid character. Returns a job id.',
  inputSchema: z.object({
    prompt: z.string().meta({
      description: 'The body motion, for example a two-handed axe swing',
    }),
    duration: z
      .number()
      .min(0.5)
      .max(12)
      .optional()
      .meta({ description: 'Clip length in seconds' }),
  }),
}).server(async ({ prompt, duration }) => {
  const { jobId } = await generateMotion({
    adapter: motionAdapter,
    threadId: 'motion-agent',
    prompt,
    duration,
  })
  return { jobId }
})

export const checkMotionClip = toolDefinition({
  name: 'check_motion_clip',
  description:
    'Check a motion clip job. Returns the status, and the file URLs when the clip is done.',
  inputSchema: z.object({ jobId: z.string() }),
}).server(async ({ jobId }) => {
  const status = await getMotionJobStatus({ adapter: motionAdapter, jobId })
  return {
    status: status.status,
    error: status.error,
    files:
      status.motion?.assets.map((asset) => ({
        format: asset.format,
        url: asset.url,
      })) ?? [],
  }
})
```

Pass both tools to `chat()`:

```ts
// api/chat.ts
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'
import { checkMotionClip, generateMotionClip } from './tools'

export async function POST(request: Request) {
  const { messages, threadId, runId } = await chatParamsFromRequest(request)

  const stream = chat({
    adapter: openaiText('gpt-6.1-sol'),
    messages,
    threadId,
    runId,
    tools: [generateMotionClip, checkMotionClip],
  })

  return toServerSentEventsResponse(stream)
}
```

Ask the agent for "an orc attack clip". It calls `generate_motion_clip`, then `check_motion_clip` until the files are ready. For more about tools, see [Server Tools](../tools/server-tools).

## Pick a provider

| Provider | Files | Notes | In TanStack AI |
| --- | --- | --- | --- |
| fal Hunyuan Motion | FBX, JSON | Seed control. Cancel for queued jobs. No input for your own character. | `falMotion()`. See [fal.ai](../adapters/fal#motion). |
| Meshy text-to-motion | FBX (`'prime'`), BVH (`'swift'`) | `duration` is required: 2 to 10 seconds, in steps of 0.5. Cancel only for queued jobs. Puts the clip on a rig that Meshy made. | `meshyMotion()`. See [Meshy](../adapters/meshy#make-a-motion-clip). |
| Uthana | FBX, GLB | Upload your own character, and Uthana makes the clip on it. 3.0 takes the motion from a generated video. No seed. No cancel. | `uthanaMotion()`. See [Uthana](../adapters/uthana). |

To use a provider that is not built in, write an adapter.

## Write a motion adapter

An adapter connects `generateMotion()` to a provider. Extend `BaseMotionAdapter` and add three methods:

- `createMotionJob`: submit the prompt and return the job id.
- `getMotionStatus`: return `'pending'`, `'processing'`, `'completed'`, or `'failed'`.
- `getMotion`: return the finished files.
- `cancelMotionJob` (optional): add it only when the provider has a cancel API.

```ts
import { BaseMotionAdapter } from '@tanstack/ai/adapters'
import type {
  MotionGenerationOptions,
  MotionGenerationResult,
  MotionJobResult,
  MotionStatusResult,
} from '@tanstack/ai'

// Your provider client. Replace it with real HTTP or SDK calls.
declare const studio: {
  submit: (
    input: { prompt: string; seconds?: number; seed?: number },
    signal?: AbortSignal,
  ) => Promise<{ id: string }>
  status: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<{ state: 'queued' | 'running' | 'done' | 'error'; message?: string }>
  files: (
    id: string,
    signal?: AbortSignal,
  ) => Promise<Array<{ url: string; extension: string }>>
}

interface StudioMotionOptions {
  seed?: number
}

export class StudioMotionAdapter extends BaseMotionAdapter<
  'studio-motion-1',
  StudioMotionOptions
> {
  readonly name = 'studio'

  async createMotionJob(
    options: MotionGenerationOptions<StudioMotionOptions>,
  ): Promise<MotionJobResult> {
    options.logger.request(`activity=generateMotion provider=studio`, {
      provider: 'studio',
      model: this.model,
    })
    const job = await studio.submit(
      {
        prompt: options.prompt,
        seconds: options.duration,
        seed: options.modelOptions?.seed,
      },
      options.abortSignal,
    )
    return { jobId: job.id, model: this.model }
  }

  async getMotionStatus(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<MotionStatusResult> {
    const job = await studio.status(jobId, options?.abortSignal)
    switch (job.state) {
      case 'queued':
        return { jobId, status: 'pending' }
      case 'running':
        return { jobId, status: 'processing' }
      case 'done':
        return { jobId, status: 'completed' }
      case 'error':
        return { jobId, status: 'failed', error: job.message }
    }
  }

  async getMotion(
    jobId: string,
    options?: { abortSignal?: AbortSignal },
  ): Promise<MotionGenerationResult> {
    const files = await studio.files(jobId, options?.abortSignal)
    return {
      jobId,
      model: this.model,
      assets: files.map((file) => ({ url: file.url, format: file.extension })),
    }
  }
}
```

Use it like any other adapter: `generateMotion({ adapter: new StudioMotionAdapter('studio-motion-1'), ... })`.

Rules for an adapter:

- Return only the metadata that the provider sends. Do not guess a clip length or a frame rate.
- Set `progress` only when the provider reports a real number.
- If the provider answers at once, do the work in `createMotionJob`. Then return `'completed'` on the first `getMotionStatus` call.
- Pass `abortSignal` to the HTTP call. It stops the request, not the provider job.

## Advanced

### Check a job from another request

`getMotionJobStatus()` needs only the adapter and the job id. You can submit in one request and check in another request, or in another process. When the job is complete, `status.motion` holds the files.

### Middleware, tracing, and devtools

A job that you submit and check later is one middleware run:

- The `generateMotion()` call without `stream` opens the run.
- The `getMotionJobStatus()` call that sees `'completed'` or `'failed'` closes it.
- Pass the same `middleware` array and the same `threadId` to both calls.

With `stream: true`, one call is one run from submit to result.

`otelMiddleware()` names the span operation `motion_generation`. See [OpenTelemetry](../advanced/otel). The devtools show `motion:request:started`, `motion:request:completed`, `motion:request:error`, and `motion:usage` events.
