---
title: Uthana
id: uthana-adapter
description: "Make skeletal animation clips (FBX, GLB) from a prompt with Uthana in TanStack AI with @tanstack/ai-uthana. Upload your own humanoid character, and Uthana makes the clip on that rig."
keywords:
  - tanstack ai
  - uthana
  - motion generation
  - generateMotion
  - text-to-motion
  - retargeting
  - animation
  - fbx
  - glb
  - adapter
---

`uthanaMotion()` with `generateMotion()` turns a prompt into a skeletal animation clip (FBX or GLB). Upload your own humanoid character, and Uthana makes the clip on that rig. The adapter has no chat.

> [!WARNING]
> Motion generation is experimental. The API can change. Uthana bills for each second of motion.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-uthana
vue: @tanstack/ai @tanstack/ai-uthana
solid: @tanstack/ai @tanstack/ai-uthana
svelte: @tanstack/ai @tanstack/ai-uthana
preact: @tanstack/ai @tanstack/ai-uthana
angular: @tanstack/ai @tanstack/ai-uthana
vanilla: @tanstack/ai @tanstack/ai-uthana
octane: @tanstack/ai @tanstack/ai-uthana

<!-- ::end:tabs -->

## 2. Set the API key

Create an API key in your [Uthana](https://uthana.com) account. Put it in the environment of your server:

```bash
UTHANA_API_KEY=your-uthana-key
```

`uthanaMotion` reads `UTHANA_API_KEY`. To pass the key in code, set `apiKey`:

```ts
import { uthanaMotion } from '@tanstack/ai-uthana'

const adapter = uthanaMotion('text-to-motion-3.0', {
  apiKey: process.env.UTHANA_API_KEY,
})
```

## 3. Generate a clip

This script makes an axe attack and saves the FBX next to the script. A 3.0 job takes about 2 minutes. A 4 second clip costs about $0.40.

```ts
import { writeFile } from 'node:fs/promises'
import { generateMotion, getMotionJobStatus } from '@tanstack/ai'
import { uthanaMotion } from '@tanstack/ai-uthana'

const adapter = uthanaMotion('text-to-motion-3.0')

const { jobId } = await generateMotion({
  adapter,
  threadId: 'orc-attacks',
  prompt:
    'A heavy warrior raises a two-handed axe overhead and slams it down',
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
  // asset.url is a data: URL that holds the whole file.
  const response = await fetch(asset.url)
  const fileName = asset.fileName ?? `orc-attack.${asset.format}`
  await writeFile(fileName, Buffer.from(await response.arrayBuffer()))
  console.log(`Saved ${fileName}`)
}
```

Run the script. You now have an FBX attack clip on disk, made on Uthana's default character "Tar".

Uthana serves files only with your API key. So the adapter downloads each file and returns it as a `data:` URL. The URL does not expire, but it is large. Save the bytes with your game assets.

## 4. Stream the job to the browser

Pass `stream: true`. The server submits the job, checks it, and streams each status to the browser.

Server route at `/api/generate/motion`:

```ts
import {
  generateMotion,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { uthanaMotion } from '@tanstack/ai-uthana'

export async function POST(request: Request) {
  const { input, threadId, runId } = await generationParamsFromRequest(
    'motion',
    request,
  )
  if (typeof input.prompt !== 'string') {
    return new Response('Send a text prompt.', { status: 400 })
  }

  const stream = generateMotion({
    adapter: uthanaMotion('text-to-motion-3.0'),
    prompt: input.prompt,
    duration: typeof input.duration === 'number' ? input.duration : undefined,
    modelOptions: { formats: ['fbx', 'glb'] },
    stream: true,
    pollingInterval: 5000,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream)
}
```

In the browser, read the stream with the generic `useGeneration` hook and `MotionGenerationResult`. The client code is the same for every motion provider:

- [Show the job in a browser](../media/motion-generation#show-the-job-in-a-browser) has a short React component.
- The [Generate Motion tutorial](../tutorials/generate-motion) builds a full page with status lines and download links.

Each asset `url` is a `data:` URL, so a link with `download={asset.fileName}` saves the file.

## Use your own character

A clip made on Tar needs a retarget in your engine. Upload your own character instead, and Uthana makes the clip on its proportions.

1. Export your character as a humanoid FBX or GLB file, under 30 MB.
2. Upload it with `createUthanaCharacter()`. Uthana rigs the mesh for you:

```ts
import { readFile } from 'node:fs/promises'
import { createUthanaCharacter } from '@tanstack/ai-uthana'

const bytes = await readFile('orc.glb')
const character = await createUthanaCharacter({
  file: new Blob([bytes]),
  fileName: 'orc.glb',
  name: 'Orc',
})

console.log(character.characterId, character.autoRigConfidence)
```

3. Save `characterId`. If you upload the same file again, you get the same character.
4. Pass the id as `modelOptions.character_id`:

```ts
import { generateMotion } from '@tanstack/ai'
import { uthanaMotion } from '@tanstack/ai-uthana'

const { jobId } = await generateMotion({
  adapter: uthanaMotion('text-to-motion-3.0'),
  threadId: 'orc-attacks',
  prompt: 'An orc chieftain swings a two-handed axe in a wide arc',
  duration: 5,
  modelOptions: { character_id: 'your-character-id', formats: ['fbx', 'glb'] },
})
```

The downloaded files now hold your orc's skeleton and the attack.

About the upload:

- `autoRigConfidence` is a number from 0 to 1. Higher is better. A test upload of an orc chieftain GLB got 0.55.
- If your model already has a rig, set `autoRig: false`. Uthana then uses your rig.
- `fileName` must end in `.fbx` or `.glb`. Uthana reads the format from it.

The repo example has two scripts that do this from the command line:

- [`scripts/upload-uthana-character.ts`](https://github.com/TanStack/ai/tree/main/examples/react/generate-motion/scripts/upload-uthana-character.ts) uploads a model and prints the character id.
- [`scripts/generate-orc-clips.ts`](https://github.com/TanStack/ai/tree/main/examples/react/generate-motion/scripts/generate-orc-clips.ts) with `--set uthana` makes a set of clips. Set `UTHANA_CHARACTER_ID` to make them on your character.

## Models and options

Pass the id as a string literal.

| Id | Clip length | Price |
| --- | --- | --- |
| `text-to-motion-3.0` | 4 to 10 seconds | About $0.10 per second of motion |
| `text-to-motion-3.0-lite` | 5 to 10 seconds | About $0.10 per second of motion |
| `text-to-motion-3.0-mini` | 5 to 10 seconds | About $0.075 per second of motion |

Prices are from the Uthana docs and can change. Set the length with `duration`, in seconds.

A 3.0 job makes a source video first. Then Uthana takes the motion out of that video. The job result names the generated video.

### Model options

Put these in `modelOptions`:

| Option | Meaning | Default |
| --- | --- | --- |
| `character_id` | The character to make the clip for and download on | Tar (`UTHANA_DEFAULT_CHARACTER_ID`) |
| `formats` | The files to download: `'fbx'`, `'glb'`, or both | `['fbx']` |
| `fps` | The frame rate of the files: `24`, `30`, or `60` | Uthana's default |
| `fast` | Uthana's faster mode | `false` |
| `rewrite_prompt` | Uthana rewrites the prompt before it makes the clip | `true` |

### What you get back

`status.motion` (or the `generation:result` event) is a `MotionGenerationResult`. Each asset has:

- `url`: a `data:` URL with the file bytes.
- `format`: `'fbx'` or `'glb'`.
- `fileName`: `uthana-<motion id>.<format>`.
- `contentType` and `fileSize`.

The result has no `seed` and no `usage`. Uthana does not return them.

## What Uthana does not do

- **No seed and no guidance.** You cannot repeat a take with the same seed.
- **No cancel.** Uthana has no cancel API, so `cancelMotionJob()` throws. A closed stream or `abortSignal` stops the local work only. The job keeps running, and you still pay for it.
- **No progress number.** The status goes from `pending` to `processing` to `completed` or `failed`. The stream sends no `generation:progress` events.

If a job fails, `status.error` holds the error text from Uthana.

## Advanced

### Check a job from another process

`getMotionJobStatus()` downloads the files when the job is complete. The job id holds the `character_id`, `formats`, and `fps` of the submit, so any adapter downloads the same files:

```ts
import { getMotionJobStatus } from '@tanstack/ai'
import { uthanaMotion } from '@tanstack/ai-uthana'

// jobId is the id that generateMotion() returned, in any process.
export function checkMotionJob(jobId: string) {
  return getMotionJobStatus({
    adapter: uthanaMotion('text-to-motion-3.0'),
    jobId,
  })
}
```

Keep the full job id. The part after `?` holds the options.

### Downloads on your plan

On a pay-as-you-go Uthana account, downloads are unlimited. Other plans count download seconds each month. The adapter downloads each format in `formats` once for each clip.

### Bring your own key

`uthanaByok` from `@tanstack/ai-uthana/byok` declares Uthana for the BYOK store, with `UTHANA_API_KEY` as its env var. On the server, pass the key that you read as `uthanaMotion(model, { apiKey })`. See [Bring Your Own Key](../advanced/byok).

### API reference

| Export | What it does |
| --- | --- |
| `uthanaMotion(model, config?)` | Creates a motion adapter for `generateMotion()` |
| `createUthanaCharacter(options)` | Uploads a humanoid model and returns `{ characterId, name, autoRigConfidence? }` |
| `UTHANA_DEFAULT_CHARACTER_ID` | The id of Tar, Uthana's default character |

The `config` fields:

- `apiKey`: the Uthana API key. The default is `UTHANA_API_KEY`.
- `baseUrl`: the API base URL. The default is `https://uthana.com`.
- `fetch`: your own `fetch` function.
- `defaults`: model options for every job on this adapter.

`createUthanaCharacter` takes `file`, `fileName`, `name`, and `autoRig`, plus `apiKey`, `baseUrl`, `fetch`, and `abortSignal`.
