---
title: Live Generation
id: live-generation
order: 6.5
description: "Open a live, prompt-steerable video session with generateLive(). Mint a connect payload on the server, connect in the browser, and steer the stream with new prompts."
keywords:
  - tanstack ai
  - live generation
  - generateLive
  - reactor
  - fal
  - h3 max director
  - helios
  - live video
  - experimental
---

# Live Generation (Experimental)

You want a video that plays while it generates. You also want to change the prompt mid-run. A finite video job stops with a file. `generateLive()` opens a session instead.

Call `generateLive()` on the server. It returns a connect payload: a model id, a prompt, and a token. The browser uses that payload to open the stream.

> **Experimental.** The API can change. Live models bill per session-second while a GPU is held.

## 1. Mint a session on the server

Pick one adapter. They do not return a download URL.

```ts group=live-reactor
import { generateLive } from '@tanstack/ai'
import { reactorVideo } from '@tanstack/ai-reactor'

const live = await generateLive({
  adapter: reactorVideo('helios'),
  prompt: 'A chef tosses noodles in a steel wok, flames leaping',
})

// Hand live.token, live.model, and live.prompt to the browser.
```

```ts group=live-fal
import { generateLive } from '@tanstack/ai'
import { falLive } from '@tanstack/ai-fal'

const live = await generateLive({
  adapter: falLive('minimax/h3-max/director'),
  prompt: 'Live shopping stream: a host holds up a gold watch to camera',
})

// live.model is 'fal-ai/minimax-h3-max-director'. Hand it to the browser.
```

Set `REACTOR_API_KEY` or `FAL_KEY`, or pass `apiKey` in the adapter config. Do not put the key in the JSON body.

A full app lives in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media).

## 2. Connect in the browser

The server half is the same for every live adapter. The browser client is not.

### Reactor

Install `@reactor-team/js-sdk`. Connect with the token. Helios uses `set_sr_scale`, then `set_prompt`, then `start`.

```ts group=live-reactor
import { Reactor } from '@reactor-team/js-sdk'

const reactor = new Reactor({ modelName: live.model })
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

await reactor.connect(live.token)
await reactor.sendCommand('set_sr_scale', { sr_scale: '2x' })
await reactor.sendCommand('set_prompt', { prompt: live.prompt })
await reactor.sendCommand('start', {})
```

FastH3 uses `enqueue` only. LongLive uses `set_shot` then `start`.

Helios can also take a seed image. Pass a `File` from `<input type="file">`. Do not send base64.

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
await reactor.sendCommand('set_conditioning', { prompt: live.prompt, image })
await reactor.sendCommand('start', {})
```

A later `set_prompt` morphs the shot at the next chunk.

See the [Reactor adapter](../adapters/reactor) for model ids.

### fal H3 Max Director

Install `@fal-ai/client@alpha`. Keep `FAL_KEY` on the server. `live.model` is the WMA app id. Open WMA through a proxy that attaches the key. Do not send `live.token` as `Key` credentials.

The example proxy is `src/routes/api.fal.proxy.ts` in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media). It attaches the key and forwards only to `wma.fal.run` (`/ice`, `/session`, `/session/heartbeat`) and Director `/ice`.

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

To steer, send `{ type: 'prompt', prompt, prompt_version }` and increase `prompt_version` each time. To stop, send `{ type: 'stop' }` and close the session.

Director bills a 60 second minimum. Resolution is `480p` or `768p`. See the [fal adapter](../adapters/fal).

## Models

| Adapter | Id | What it does |
| --- | --- | --- |
| `reactorVideo()` | `helios` | Interactive realtime video |
| `reactorVideo()` | `fast-h3` | Fast live clips on a live track |
| `reactorVideo()` | `longlive-v2` | Shot-based live clips |
| `falLive()` | `minimax/h3-max/director` | Steerable live stream over WMA |

For Orbis and LingBot, use [World Generation](./world-generation). For a file that finishes, use [Video Generation](./video-generation).

## What you have now

A server call that returns a connect payload. The browser opens the stream and steers it until you stop.
