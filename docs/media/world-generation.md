---
title: World Generation
id: world-generation
order: 7
description: "Make a world from a prompt with generateWorld(). Reactor opens a live world you can steer in the browser. World Labs returns a finished 3D world."
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

`generateWorld()` builds a world on the server from a prompt. The result is one of two kinds:

- **A live world** (Reactor). The server mints a session token. The browser connects, plays the world, and changes it with new prompts.
- **A finished 3D world** (World Labs Marble). The server waits for the job, then returns a viewer URL and asset links.

> [!WARNING]
> World generation is experimental. The API can change. Live world models bill for each second that a session holds a GPU. World Labs bills in credits for each generation.

## Quick setup: a live world

This streams a live Reactor Orbis world. It takes about 10 minutes.

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

3. Add a `POST` route at `/api/world` that mints a session:

```ts
import { generateWorld } from '@tanstack/ai'
import { reactorWorld } from '@tanstack/ai-reactor'

export async function POST(request: Request) {
  const body: unknown = await request.json()
  const prompt =
    typeof body === 'object' &&
    body !== null &&
    'prompt' in body &&
    typeof body.prompt === 'string'
      ? body.prompt
      : ''
  if (prompt.length === 0) {
    return Response.json({ error: 'prompt is required' }, { status: 400 })
  }

  const world = await generateWorld({
    adapter: reactorWorld('visko-orbis-stable'),
    prompt,
    threadId: 'thread-1',
  })

  return Response.json({
    token: world.token,
    model: world.model,
    prompt: world.prompt,
    expiresAt: world.expiresAt,
  })
}
```

4. In the browser, connect and play the world in a `<video>` element:

```ts group=world-browser
import { Reactor } from '@reactor-team/js-sdk'

const video = document.querySelector('video')
if (!video) {
  throw new Error('Missing video element')
}

const world = await fetch('/api/world', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
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

The video element now plays a live world. To steer it, send a new `set_prompt`. The scene changes at the next chunk.

## How it works

The work splits in two:

- **The server** calls `generateWorld()` with a world adapter. A live adapter returns a short-lived `token`, the `model` slug to connect to, and the `prompt`. The API key stays on the server.
- **The browser** uses the Reactor SDK to connect with the token, play the stream, and send commands.

There is no client hook for worlds. For the shared model of other media types, see [Generations](./generations).

## Live world models

`reactorWorld()` takes these ids. The `model` field on the result is the Reactor connect slug.

| Id | Connect slug | What it does |
| --- | --- | --- |
| `visko-orbis-stable` | `reactor/visko-orbis-stable` | Steerable video with live audio |
| `visko-orbis-dynamic` | `reactor/visko-orbis-dynamic` | Same family, can change resolution while it runs |
| `lingbot-world-2` | `reactor/lingbot-world-2` | A world you can move through, anchored on an image |
| `lingbot` | `reactor/lingbot` | Video you can move through, anchored on an image |
| `helios` | `reactor/helios` | Interactive live video |

More notes:

- Happy Oyster (`happy-oyster-adventure`, `happy-oyster-director`) uses `createWorld` and `startTravel` after connect.
- Helios also works with `generateLiveVideo()` and `reactorVideo()`. See [Live Generation](./live-generation).
- Every id is in the [Reactor adapter](../adapters/reactor).

## Finished 3D worlds (World Labs)

World Labs Marble runs a job, not a live stream. `generateWorld()` waits until the world is ready. Then it returns a viewer URL and asset links. Set `WORLDLABS_API_KEY` on the server.

```ts
import { generateWorld } from '@tanstack/ai'
import { worldlabsWorld } from '@tanstack/ai-worldlabs'

const world = await generateWorld({
  adapter: worldlabsWorld('marble-1.1'),
  prompt: 'A mystical forest with glowing mushrooms',
  threadId: 'thread-1',
})

console.log(world.url) // The Marble viewer
```

What you get back:

- `world.url` is the Marble viewer. Do not put it in an iframe.
- `world.assets` holds splat, mesh, and panorama URLs when the provider returns them. These URLs are often signed.

Models: `marble-1.1-plus`, `marble-1.1` (the World Labs default), `marble-1.0`, and `marble-1.0-draft`. See the [World Labs adapter](../adapters/worldlabs) for image and video inputs.

A full app is in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media). Open the World tab. Pick a Reactor model for a live stream, or a Marble model for a finished 3D world. What the example shows:

- If splat files are present, it loads one SPZ in Spark. If not, it shows a thumbnail and an Open in Marble link.
- It can download the Marble files when the response includes them.
- It can save a Reactor session as MP4 when recording is on for that model or plan.

## Advanced

### Start LingBot from a seed image

LingBot and LingBot World 2 start from an image. Pass a `File` from `<input type="file" accept="image/png,image/jpeg">`. The SDK uploads the file. Do not send base64.

`start` also needs `set_prompt`. Write the prompt so it describes what the image shows. If the prompt and the image disagree, the image wins and the world drifts.

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

### Let users bring their own Reactor key

The browser can save a Reactor key and send it in an `x-byok-reactor` header. The server reads that header first, then `REACTOR_API_KEY`. Do not put the key in the JSON body.

Server:

```ts
import { generateWorld } from '@tanstack/ai'
import { byokMissing, getByokKey } from '@tanstack/ai/byok/server'
import { reactorWorld } from '@tanstack/ai-reactor'
import { reactorByok } from '@tanstack/ai-reactor/byok'

export async function POST(request: Request) {
  const apiKey = getByokKey(request, reactorByok)
  if (!apiKey) return byokMissing(reactorByok)

  const world = await generateWorld({
    adapter: reactorWorld('visko-orbis-stable', { apiKey }),
    prompt: 'A dramatic coastline of black volcanic cliffs at golden hour',
    threadId: 'thread-1',
  })

  return Response.json({
    token: world.token,
    model: world.model,
    prompt: world.prompt,
  })
}
```

Browser:

```ts
import { defineByok, defaultByokStorage } from '@tanstack/ai-client/byok'
import { reactorByok } from '@tanstack/ai-reactor/byok'

const byok = defineByok({
  storage: defaultByokStorage(),
  providers: [reactorByok],
})
byok.setServerCoverage(true)

const world = await fetch('/api/world', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...byok.headers(reactorByok.id),
  },
}).then((response) => response.json())
```

See [Bring Your Own Key](../advanced/byok) for the key store and a save UI.

### World Labs jobs that do not wait

Pass `modelOptions: { wait: false }` to `generateWorld()`. Then it returns at once with an `operationId`. This SDK cannot resume that id. See the [World Labs adapter](../adapters/worldlabs).
