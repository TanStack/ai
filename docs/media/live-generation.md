---
title: Live Generation
id: live-generation
order: 6.5
description: "Stream a video that plays while it generates, and change the prompt while it runs. Mint a session on the server with generateLiveVideo(), then connect in the browser."
keywords:
  - tanstack ai
  - live generation
  - generateLiveVideo
  - reactor
  - fal
  - h3 max director
  - helios
  - live video
  - experimental
---

`generateLiveVideo()` opens a live video session. The server mints the session. The browser plays it and can change the prompt while it plays.

> [!WARNING]
> Live generation is experimental. The API can change. Live models bill for each second that a session holds a GPU.

## Quick setup

This streams a live video from Reactor Helios. It takes about 10 minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-reactor @reactor-team/js-sdk
vue: @tanstack/ai @tanstack/ai-reactor @reactor-team/js-sdk
solid: @tanstack/ai @tanstack/ai-reactor @reactor-team/js-sdk
svelte: @tanstack/ai @tanstack/ai-reactor @reactor-team/js-sdk
preact: @tanstack/ai @tanstack/ai-reactor @reactor-team/js-sdk
angular: @tanstack/ai @tanstack/ai-reactor @reactor-team/js-sdk
vanilla: @tanstack/ai @tanstack/ai-reactor @reactor-team/js-sdk
octane: @tanstack/ai @tanstack/ai-reactor @reactor-team/js-sdk

<!-- ::end:tabs -->

2. Put your key in `.env` on the server:

```bash
REACTOR_API_KEY=your-reactor-key
```

3. Add a `POST` route at `/api/live` that mints a session:

```ts
import { generateLiveVideo } from '@tanstack/ai'
import { reactorVideo } from '@tanstack/ai-reactor'

export async function POST() {
  const live = await generateLiveVideo({
    adapter: reactorVideo('helios'),
    prompt: 'A chef tosses noodles in a steel wok, flames leaping',
    threadId: 'thread-1',
  })

  return Response.json({
    token: live.token,
    model: live.model,
    prompt: live.prompt,
  })
}
```

4. In the browser, connect and play the stream in a `<video>` element:

```ts group=live-reactor
import { Reactor } from '@reactor-team/js-sdk'

const live = await fetch('/api/live', { method: 'POST' }).then((r) => r.json())
const token = typeof live.token === 'string' ? live.token : ''
const model = typeof live.model === 'string' ? live.model : ''
const prompt = typeof live.prompt === 'string' ? live.prompt : ''

const reactor = new Reactor({ modelName: model })
const video = document.querySelector('video')

reactor.on('trackReceived', (name, _track, stream) => {
  if (name !== 'main_video') return
  if (!video) return
  video.muted = true
  const attach = () => {
    video.srcObject = null
    video.srcObject = stream
    void video.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
    })
  }
  attach()
  for (const track of stream.getTracks()) {
    track.addEventListener('unmute', attach)
  }
})

await reactor.connect(token)
await reactor.sendCommand('set_sr_scale', { sr_scale: '2x' })
await reactor.sendCommand('set_prompt', { prompt })
await reactor.sendCommand('start', {})
```

The video element now plays the live stream. To steer it, send a new `set_prompt`. The shot changes at the next chunk.

A full app is in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media). Open the Live tab.

## How it works

The work splits in two:

- **The server** calls `generateLiveVideo()`. It returns a connect payload: `model` (the id the browser connects to), `prompt`, and a short-lived `token`. The API key stays on the server.
- **The browser** uses the provider SDK to connect, play the stream, and send new prompts.

The server half is the same for every live adapter. The browser half is different for each provider. There is no client hook, and there is no file at the end. For the shared model of other media types, see [Generations](./generations).

Set the key with `REACTOR_API_KEY` or `FAL_KEY`, or pass `apiKey` in the adapter config. Do not put the key in the JSON body.

## Models

| Adapter | Id | What it does |
| --- | --- | --- |
| `reactorVideo()` | `helios` | Interactive live video |
| `reactorVideo()` | `fast-h3` | Fast live clips on a live track |
| `reactorVideo()` | `longlive-v2` | Live clips, one shot at a time |
| `reactorVideo()` | `ltx2` | LTX live video |
| `falLiveVideo()` | `minimax/h3-max/director` | Steerable live stream over fal WMA |

Each Reactor model takes its own start commands:

- **Helios**: `set_sr_scale`, then `set_prompt`, then `start`.
- **FastH3**: `enqueue` only.
- **LongLive**: `set_shot`, then `start`.

See the [Reactor adapter](../adapters/reactor) for every id.

For a navigable world (Orbis, LingBot), use [World Generation](./world-generation). For a video file that finishes, use [Video Generation](./video-generation).

## fal H3 Max Director

The server half uses `falLiveVideo()`:

```ts group=live-fal
import { generateLiveVideo } from '@tanstack/ai'
import { falLiveVideo } from '@tanstack/ai-fal'

const live = await generateLiveVideo({
  adapter: falLiveVideo('minimax/h3-max/director'),
  prompt: 'Live shopping stream: a host holds up a gold watch to camera',
  threadId: 'thread-1',
})

// live.model is 'fal-ai/minimax-h3-max-director'. Send it to the browser.
```

The browser opens the stream with `@fal-ai/client@alpha`. Follow these rules:

- Keep `FAL_KEY` on the server.
- `live.model` is the WMA app id.
- Open WMA through a proxy on your server that attaches the key.
- Do not send `live.token` as `Key` credentials.

The example proxy is `src/routes/api.fal.proxy.ts` in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media). It attaches the key. It forwards only to `wma.fal.run` (`/ice`, `/session`, `/session/heartbeat`) and to the Director `/ice`.

```ts group=live-fal
import { createFalClient } from '@fal-ai/client'
import { wma } from '@fal-ai/client/realtime'

const fal = createFalClient({ proxyUrl: '/api/fal/proxy' })
const video = document.querySelector('video')

const session = fal.realtime.open(wma(live.model), {
  receive: ['video', 'audio'],
  onError: (error) => {
    console.error(error)
  },
  onMedia: (stream) => {
    if (!video) return
    video.muted = true
    video.srcObject = stream
    void video.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
    })
  },
})

session.send({
  type: 'configure',
  prompt: live.prompt,
  prompt_version: 1,
  protocol_version: 1,
})

await session.ready
```

To steer, send `{ type: 'prompt', prompt, prompt_version }`. Increase `prompt_version` each time. To stop, send `{ type: 'stop' }` and close the session.

Director bills a minimum of 60 seconds. The resolution is `480p` or `768p`. See the [fal adapter](../adapters/fal).

## Advanced

### Start Helios from a seed image

Helios can start from an image. Pass a `File` from `<input type="file">`. Do not send base64. The SDK uploads the file:

```ts group=live-reactor
const picker = document.querySelector('input[type="file"]')
if (!(picker instanceof HTMLInputElement)) {
  throw new Error('Pick a seed image')
}
const file = picker.files?.[0]
if (file === undefined) {
  throw new Error('Pick a seed image')
}
const image = await reactor.uploadFile(file)
await reactor.sendCommand('set_conditioning', { prompt, image })
await reactor.sendCommand('start', {})
```

### The connect payload

`generateLiveVideo()` returns these fields:

| Field | Description |
| --- | --- |
| `id` | The id of this generation |
| `model` | The id the browser connects to. Reactor: a slug such as `reactor/helios`. fal: the WMA app id. |
| `token` | A short-lived session token. Reactor uses it to connect. fal does not. |
| `expiresAt` | The token expiry, in milliseconds since epoch |
| `prompt` | The prompt that the browser sends when it starts the session |
| `status` | `'ready'` or `'waiting'` |
| `sessionId` | The provider session id, when the adapter creates one |
| `usage` | Usage and billing, when the adapter reports it |
