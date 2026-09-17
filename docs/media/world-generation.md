---
title: World Generation
id: world-generation
order: 7
description: "Generate a world with generateWorld(). Live adapters mint a session token. Job adapters return a finished 3D world URL."
keywords:
  - tanstack ai
  - world generation
  - generateWorld
  - reactor
  - worldlabs
  - marble
  - orbis
  - infinite world
  - live video
  - experimental
---

# World Generation (Experimental)

You want a world from a prompt. Some providers open a live session you can steer. Other providers generate a finished 3D world. Open `world.url` to view it. Asset URLs on `world.assets` are often signed.

Call `generateWorld()` on the server with a world adapter. Reactor mints a session token. World Labs returns a Marble viewer URL after the job finishes.

> **Experimental.** The API can change. Live world models bill per session-second while a GPU is held. World Labs bills in credits per generation.

## 1. Mint a session on the server

The browser can paste a Reactor key. The relay reads `x-byok-reactor`, then `REACTOR_API_KEY`. Do not put the key in the JSON body.

```ts
import { generateWorld } from '@tanstack/ai'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { reactorWorld } from '@tanstack/ai-reactor'
import { reactorByok } from '@tanstack/ai-reactor/byok'

export async function POST(request: Request) {
  const apiKey = getByokKey(request, reactorByok)
  if (!apiKey) return byokMissing(reactorByok)

  const body = await request.json()
  const prompt = typeof body.prompt === 'string' ? body.prompt : ''
  if (prompt.length === 0) {
    return Response.json({ error: 'prompt is required' }, { status: 400 })
  }

  const world = await generateWorld({
    adapter: reactorWorld('visko-orbis-stable', { apiKey }),
    prompt,
  })

  return Response.json({
    token: world.token,
    model: world.model,
    prompt: world.prompt,
    expiresAt: world.expiresAt,
  })
}
```

See [Bring Your Own Key](../advanced/byok) for the client store.

## 2. Connect in the browser

Install `@reactor-team/js-sdk`. Connect with the token. Then set the prompt and start.

```ts group=world-browser
import { Reactor } from '@reactor-team/js-sdk'
import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'
import { reactorByok } from '@tanstack/ai-reactor/byok'

const byok = defineByok({
  storage: defaultByokStorage(),
  providers: [reactorByok],
})
byok.setServerCoverage(true)

const video = document.querySelector('video')
if (!video) {
  throw new Error('Missing video element')
}

const world = await fetch('/api/world', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...byok.headers(reactorByok.id),
  },
  body: JSON.stringify({
    prompt:
      'A dramatic coastline of black volcanic cliffs at golden hour, a single unbroken take.',
  }),
}).then(async (response) => {
  if (!response.ok) {
    throw new Error('World session failed')
  }
  return response.json()
})

const token = typeof world.token === 'string' ? world.token : ''
const model = typeof world.model === 'string' ? world.model : ''
const prompt = typeof world.prompt === 'string' ? world.prompt : ''
if (token.length === 0 || model.length === 0 || prompt.length === 0) {
  throw new Error('World payload is incomplete')
}

const reactor = new Reactor({ modelName: model })

reactor.on('trackReceived', (name, _track, stream) => {
  if (name !== 'main_video') return
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
await reactor.sendCommand('set_resolution', { resolution: '1080p' })
await reactor.sendCommand('set_prompt', { prompt })
await reactor.sendCommand('start', {})
```

The video element now plays a live world. A new `set_prompt` during the run morphs the scene at the next chunk.

LingBot and LingBot World 2 start from a seed image. Pass a `File` from `<input type="file" accept="image/png,image/jpeg">`. The SDK uploads the file. Do not send base64. `start` also needs `set_prompt`. Write the prompt to describe what the image shows. When the prompt and the image disagree, the image wins and the world drifts.

```ts group=world-browser
const picker = document.querySelector('input[type="file"]')
if (!(picker instanceof HTMLInputElement)) {
  throw new Error('Pick a seed image')
}
const file = picker.files?.[0]
if (file === undefined) {
  throw new Error('Pick a seed image')
}
const image = await reactor.uploadFile(file)
await reactor.sendCommand('set_image', { image })
await reactor.sendCommand('set_prompt', { prompt })
await reactor.sendCommand('start', {})
```

## Models

`reactorWorld()` accepts these ids. The result `model` field is the Reactor connect slug.

| Id | Connect slug | What it does |
| --- | --- | --- |
| `visko-orbis-stable` | `reactor/visko-orbis-stable` | Steerable video with realtime audio |
| `visko-orbis-dynamic` | `reactor/visko-orbis-dynamic` | Same family, live resolution switch |
| `lingbot-world-2` | `reactor/lingbot-world-2` | Image-anchored navigable world |
| `lingbot` | `reactor/lingbot` | Image-anchored navigable video |
| `helios` | `reactor/helios` | Interactive realtime video |

Happy Oyster (`happy-oyster-adventure`, `happy-oyster-director`) uses `createWorld` and `startTravel` after connect. See the [Reactor adapter](../adapters/reactor) for every id. Helios also works with `generateLiveVideo()` and `reactorVideo()`. See [Live Generation](./live-generation).

A full app lives in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media). Open the World tab. Pick a Reactor model for a live stream, or a Marble model for a finished 3D world. If splat files are present, the example loads one SPZ in Spark. If not, it shows a thumbnail and an Open in Marble link.

## Finished 3D worlds (World Labs)

World Labs Marble is a job, not a live stream. `generateWorld()` waits until the world is ready, then returns a viewer URL and asset links.

```ts
import { generateWorld } from '@tanstack/ai'
import { worldlabsWorld } from '@tanstack/ai-worldlabs'

const world = await generateWorld({
  adapter: worldlabsWorld('marble-1.1'),
  prompt: 'A mystical forest with glowing mushrooms',
})
```

`world.url` is the Marble viewer. Do not iframe it. `world.assets` is optional and holds splat, mesh, and panorama URLs when the provider returns them. See the [World Labs adapter](../adapters/worldlabs) for image and video inputs, models, and `wait: false`. `wait: false` returns `operationId`. This SDK cannot resume that id.

## What you have now

A server route that mints a live world session, or a server call that returns a finished Marble world. For Reactor, connect in the browser and change the prompt to steer the stream. The media example can save a Reactor session as MP4 when recording is enabled for that model or plan, and download Marble files when the response includes them.
