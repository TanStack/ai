---
title: Live Generation
id: live-generation
order: 6.5
description: "Open a live, prompt-steerable video session with generateLive(). Mint a token on the server, connect in the browser, and steer the stream with new prompts."
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

Call `generateLive()` on the server. It returns a short-lived token, a model slug, and the prompt. The browser connects, sets the prompt, and starts the stream.

> **Experimental.** The API can change. Live models bill per session-second while a GPU is held.

## 1. Mint a session on the server

Pick one adapter. Reactor and fal both mint a token. They do not return a download URL.

```ts group=live-reactor
import { generateLive } from '@tanstack/ai'
import { reactorVideo } from '@tanstack/ai-reactor'

const live = await generateLive({
  adapter: reactorVideo('helios'),
  prompt: 'A chef tosses noodles in a steel wok, flames leaping',
})

// Hand live.token, live.model, and live.prompt to the browser.
```

```ts
import { generateLive } from '@tanstack/ai'
import { falLive } from '@tanstack/ai-fal'

const live = await generateLive({
  adapter: falLive('minimax/h3-max/director'),
  prompt: 'Live shopping stream: a host holds up a gold watch to camera',
})
```

Set `REACTOR_API_KEY` or `FAL_KEY`, or pass `apiKey` in the adapter config. Do not put the key in the JSON body.

A full app lives in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media).

## 2. Connect in the browser

The server half is the same for every live adapter. The browser client is not.

### Reactor

Install `@reactor-team/js-sdk`. Connect with the token. Then set the prompt and start.

```ts group=live-reactor
import { Reactor } from '@reactor-team/js-sdk'

const reactor = new Reactor({ modelName: live.model })
const video = document.querySelector('video')

reactor.on('trackReceived', (name, _track, stream) => {
  if (name !== 'main_video') return
  if (!video) return
  video.muted = true
  video.srcObject = stream
  void video.play().catch(() => {})
})

await reactor.connect(live.token)
await reactor.sendCommand('set_prompt', { prompt: live.prompt })
await reactor.sendCommand('start', {})
```

A later `set_prompt` morphs the shot at the next chunk.

See the [Reactor adapter](../adapters/reactor) for model ids and provider options.

### fal H3 Max Director

Install `@fal-ai/client@alpha`. Open the WMA session with the minted token. Then send `configure`.

```ts ignore
import { createFalClient } from '@fal-ai/client'
import { wma } from '@fal-ai/client/realtime'

const fal = createFalClient({ credentials: live.token })
const video = document.querySelector('video')

const session = fal.realtime.open(wma('minimax/h3-max/director'), {
  receive: ['video', 'audio'],
  onMedia: (stream) => {
    if (!video) return
    video.muted = true
    video.srcObject = stream
    void video.play().catch(() => {})
  },
})

session.send({
  type: 'configure',
  prompt: live.prompt,
  prompt_version: 1,
  protocol_version: 1,
})
```

To steer, send `{ type: 'prompt', prompt, prompt_version }` and increase `prompt_version` each time. To stop, send `{ type: 'stop' }` and close the session.

Director bills a 60 second minimum. Resolution is `480p` or `768p`. See the [fal adapter](../adapters/fal).

## Models

| Adapter | Id | What it does |
| --- | --- | --- |
| `reactorVideo()` | `helios` | Interactive realtime video |
| `reactorVideo()` | `fast-h3` | Fast live clips on a live track |
| `falLive()` | `minimax/h3-max/director` | Steerable live stream over WMA |

Reactor also lists Orbis, LongLive, and LTX. Those ids are in the [Reactor adapter](../adapters/reactor).

For a navigable place you stay in, use [World Generation](./world-generation). For a file that finishes, use [Video Generation](./video-generation).

## What you have now

A server call that mints a live session token. The browser connects and steers the stream until you stop.
