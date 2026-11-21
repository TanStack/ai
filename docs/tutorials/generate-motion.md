---
title: Generate Motion
id: generate-motion
order: 10
description: "Build a React page in a TanStack Start app that makes two FBX animation clips for a game ability. useGeneration streams the fal job status, and the page shows the files and an ability manifest."
keywords:
  - tanstack ai
  - tutorial
  - generate motion
  - generateMotion
  - useGeneration
  - fbx
  - animation
  - fal
  - byok
  - tanstack start
---

Your team needs animation clips for a game ability, and each clip is a fal job that runs for seconds to minutes. A plain request cannot wait that long, and nobody can see what the job does.

This tutorial builds a page that makes two clips for an orc "Leap Slam": the attack and the enemy reaction. The page streams the job status, shows the FBX files, and builds the ability manifest that your game imports. It takes about 15 minutes.

The user pastes a fal key in the tab. This tutorial uses React and TanStack Start. For a script that saves an FBX without a UI, open [Motion Generation](../media/motion-generation). To skip the setup, paste a key in the sandbox under [Try it](#try-it).

## 1. Create a Start app

```bash
npx @tanstack/cli@latest create
```

Pick React. For more options, see [Start getting started](https://tanstack.com/start/latest/docs/framework/react/quick-start).

Install the TanStack AI packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-fal

<!-- ::end:tabs -->

Get a fal key from [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys).

The app has two sides:

- **The client** holds the key, shows the two clip panels, and reads the job status from the stream.
- **The server routes** read the key, submit the job to fal, stream its status, and cancel a job on request.

## 2. Keep the key in the tab

Create `src/lib/byok.ts`. `memoryStorage()` keeps the key in this tab only. A reload clears it.

```typescript
import { defineByok, memoryStorage } from '@tanstack/ai-react/byok'
import { falByok } from '@tanstack/ai-fal/byok'

export const byok = defineByok({
  storage: memoryStorage(),
  providers: [falByok],
})
```

Create `src/components/fal-key-form.tsx`. `byok.update` saves the key, and `byok.clear` removes it. `useByok` reads the status.

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
          Paste a fal key, then generate again.
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </form>
  )
}
```

For passkeys or other storage, open [Bring Your Own Key](../advanced/byok).

## 3. Stream one clip

Each clip is one generation. There is no motion hook, so the page uses the generic `useGeneration` hook with `MotionGenerationResult`.

Replace `src/routes/index.tsx`. Start with the imports:

```tsx ignore
import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchServerSentEvents, useGeneration } from '@tanstack/ai-react'
import { falByok } from '@tanstack/ai-fal/byok'
import type { MotionGenerationResult, MotionStatusResult } from '@tanstack/ai'
import { FalKeyForm } from '@/components/fal-key-form'
import { byok } from '@/lib/byok'
```

Then add a hook for one clip slot. `onChunk` reads two `CUSTOM` events from the stream:

- `motion:job:created` gives the fal job id. The cancel button needs it.
- `motion:status` gives the queue state after each status check.

`stop()` closes the stream in this tab only. The fal job keeps running.

```tsx ignore
type MotionInput = { prompt: string; duration: number }

function hasJobId(value: unknown): value is { jobId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'jobId' in value &&
    typeof value.jobId === 'string'
  )
}

function isMotionStatus(value: unknown): value is MotionStatusResult {
  return (
    hasJobId(value) && 'status' in value && typeof value.status === 'string'
  )
}

// One generation slot. The hook streams the job from /api/generate/motion.
// onChunk reads the fal job id and the queue status from CUSTOM events.
function useMotionClip(threadId: string) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [jobStatus, setJobStatus] = useState<MotionStatusResult | null>(null)
  const [stopped, setStopped] = useState(false)
  const generation = useGeneration<MotionInput, MotionGenerationResult>({
    connection: fetchServerSentEvents('/api/generate/motion'),
    threadId,
    byok,
    onChunk: (chunk) => {
      if (chunk.type !== 'CUSTOM') return
      if (chunk.name === 'motion:job:created' && hasJobId(chunk.value)) {
        setJobId(chunk.value.jobId)
      }
      if (chunk.name === 'motion:status' && isMotionStatus(chunk.value)) {
        setJobStatus(chunk.value)
      }
    },
  })

  return {
    ...generation,
    jobId,
    jobStatus,
    stopped,
    generate: (input: MotionInput) => {
      generation.reset()
      setJobId(null)
      setJobStatus(null)
      setStopped(false)
      return generation.generate(input)
    },
    // stop() closes the stream in this tab. The fal job keeps running.
    stop: () => {
      generation.stop()
      setStopped(true)
    },
  }
}
```

## 4. Show the status and the files

A fal job waits in a queue, then runs. Turn each state into a line that your team can read:

```tsx ignore
type MotionClip = ReturnType<typeof useMotionClip>

function describeJob(status: MotionStatusResult) {
  switch (status.status) {
    case 'pending':
      return status.queuePosition === undefined
        ? 'Queued on fal'
        : `Queued on fal, position ${status.queuePosition}`
    case 'processing':
      return 'Generating'
    case 'completed':
      return 'Finished on fal, fetching files'
    case 'failed':
      return `Failed: ${status.error ?? 'fal gave no reason'}`
  }
}

function describeClip(clip: MotionClip) {
  if (clip.error) return `Error: ${clip.error.message}`
  if (clip.result) return 'Done'
  if (clip.stopped) return 'Stopped watching. The fal job keeps running.'
  if (clip.jobStatus) return describeJob(clip.jobStatus)
  if (clip.isLoading) return 'Submitting'
  return 'Not started'
}
```

When the stream ends, `clip.result.assets` holds the files. Each asset has a `url`, a `format`, and a `fileName` and `fileSize` when fal reports them. Show a download link for each file:

```tsx ignore
      {clip.result ? (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-1 text-sm">
            {clip.result.assets.map((asset) => (
              <li key={asset.url}>
                <a
                  href={asset.url}
                  download={asset.fileName}
                  target="_blank"
                  rel="noreferrer"
                  className="text-orange-400 underline"
                >
                  Download {asset.fileName ?? asset.format}
                </a>{' '}
                <span className="text-gray-400">
                  ({asset.format.toUpperCase()}
                  {asset.fileSize === undefined
                    ? ''
                    : `, ${Math.round(asset.fileSize / 1024)} KB`}
                  )
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-400">
            fal file links expire. Download the file and store it with your game
            assets.
          </p>
        </div>
```

fal file links expire. The page tells the user to download each file and store it.

## 5. Build the ability manifest

The game needs to know which clips belong together and when the hit lands. fal does not return contact timing. A designer sets the impact time after a preview of the attack clip.

Add the prompts and the timing near the top of the file:

```tsx ignore
const CLIP_SECONDS = 4

const ATTACKER_PROMPT =
  'A heavy orc warrior leaps forward, raises a two-handed axe overhead, slams it down into the ground, and lands with a heavy stagger'
const REACTION_PROMPT =
  'A person is hit hard from the front, staggers backward, falls onto their back, then slowly gets up'

// A designer sets this after previewing the attacker clip. fal does not
// return contact timing, so the game owns this number, not the provider.
const IMPACT_TIME_SECONDS = 1.6
```

Build the manifest from the two finished clips:

```tsx ignore
function fbxUrl(motion: MotionGenerationResult) {
  return motion.assets.find((asset) => asset.format === 'fbx')?.url ?? null
}

// The JSON a game imports. Clips come from fal. Timing and effects are yours.
function buildManifest(
  attacker: MotionGenerationResult,
  reaction: MotionGenerationResult,
) {
  return {
    ability: 'orc-leap-slam',
    attacker: {
      clip: fbxUrl(attacker),
      source: attacker.model,
      jobId: attacker.jobId,
      seed: attacker.seed ?? null,
    },
    reactions: [{ clip: fbxUrl(reaction), trigger: 'impact' }],
    events: [
      {
        name: 'impact',
        timeSeconds: IMPACT_TIME_SECONDS,
        source: 'authored',
        note: 'Set by a designer after previewing the clip. The provider does not return contact timing.',
      },
    ],
    effects: ['shockwave', 'dust', 'ground-cracks', 'flying-rocks'],
  }
}
```

Your engine reads this manifest. It retargets the clips, attaches the axe, and blends the clips. When the impact event fires, it applies damage, plays the reaction, and spawns the effects.

## 6. Cancel a job on fal

"Stop watching" does not stop the fal job. To stop it, the page asks your server to cancel it on fal. `byok.headers` sends the key in the `x-byok-fal` header:

```tsx ignore
async function cancelOnFal(jobId: string) {
  const response = await fetch('/api/motion/cancel', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...byok.headers(falByok.id),
    },
    body: JSON.stringify({ jobId }),
  })
  if (!response.ok) throw new Error(await response.text())
}
```

The clip panels and the page layout are in the [full `index.tsx`](https://github.com/TanStack/ai/blob/main/examples/react/generate-motion/src/routes/index.tsx). Each panel has a prompt box and three buttons: Generate, Stop watching, and Cancel on fal.

## 7. Add the motion route

Create `src/routes/api.generate.motion.ts`, next to `index.tsx`. Start maps this file name to the `/api/generate/motion` path.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import {
  generateMotion,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { falMotion } from '@tanstack/ai-fal'
import { falByok } from '@tanstack/ai-fal/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

export async function POST({ request }: { request: Request }) {
  // Unwrap the prompt and duration the hook POSTed. Then read the fal key.
  const { input, threadId, runId } = await generationParamsFromRequest(
    'motion',
    request,
  )
  const apiKey = getByokKey(request, falByok)
  if (!apiKey) return byokMissing(falByok)
  if (typeof input.prompt !== 'string') {
    return new Response('This route accepts a text prompt only.', {
      status: 400,
    })
  }

  // Submit the job to fal Hunyuan Motion. stream: true polls the job and
  // sends each status to the page over SSE. The last event holds the files.
  const stream = generateMotion({
    adapter: falMotion('fal-ai/hunyuan-motion', { apiKey }),
    prompt: input.prompt,
    duration: typeof input.duration === 'number' ? input.duration : undefined,
    stream: true,
    threadId,
    runId,
  })
  return toServerSentEventsResponse(stream)
}

export const Route = createFileRoute('/api/generate/motion')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

- `generationParamsFromRequest('motion', request)` reads the prompt and the duration from the POST body.
- `getByokKey` reads the `x-byok-fal` header first. If the header is empty, it reads `FAL_KEY` from the environment. If both are empty, `byokMissing` returns HTTP 401.
- `stream: true` makes `generateMotion` submit the job, check it every 2 seconds, and stream each status. The last event holds the files.

## 8. Add the cancel route

Create `src/routes/api.motion.cancel.ts`. It maps to `/api/motion/cancel`.

```typescript ignore
import { createFileRoute } from '@tanstack/react-router'
import { cancelMotionJob } from '@tanstack/ai'
import { falMotion } from '@tanstack/ai-fal'
import { falByok } from '@tanstack/ai-fal/byok'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'

function hasJobId(body: unknown): body is { jobId: string } {
  return (
    typeof body === 'object' &&
    body !== null &&
    'jobId' in body &&
    typeof body.jobId === 'string'
  )
}

export async function POST({ request }: { request: Request }) {
  const apiKey = getByokKey(request, falByok)
  if (!apiKey) return byokMissing(falByok)
  const body: unknown = await request.json()
  if (!hasJobId(body)) {
    return Response.json({ error: 'Send { jobId } as JSON.' }, { status: 400 })
  }

  // Ask fal to stop the job. This is a remote cancel. The hook's stop()
  // only closes the stream in this tab.
  try {
    await cancelMotionJob({
      adapter: falMotion('fal-ai/hunyuan-motion', { apiKey }),
      jobId: body.jobId,
    })
    return Response.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cancel failed'
    return Response.json({ error: message }, { status: 502 })
  }
}

export const Route = createFileRoute('/api/motion/cancel')({
  server: {
    handlers: {
      POST,
    },
  },
})
```

fal removes a job that waits in the queue. A job that already runs can still finish. fal refuses a cancel for a finished job, so the route returns HTTP 502 with the fal message.

## Try it

1. Run the app.
2. Paste a fal key.
3. Click Generate on each clip.

The status moves from "Queued on fal" to "Generating" to "Done". When both clips are done, the manifest shows.

<!-- ::client-example library=ai framework=react slug=generate-motion -->

You have two FBX clips for one ability, and a manifest that links them for your engine.

The full example is on GitHub: [TanStack/ai `examples/react/generate-motion`](https://github.com/TanStack/ai/tree/main/examples/react/generate-motion).

To import the FBX into Unity or Unreal, or to let an agent make clips, open [Motion Generation](../media/motion-generation).
