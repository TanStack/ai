---
title: Reactor
id: reactor-adapter
description: "Stream live worlds and live video from Reactor models in TanStack AI with @tanstack/ai-reactor. The server mints a session token, and the browser plays and steers the stream."
keywords:
  - tanstack ai
  - reactor
  - world generation
  - live generation
  - orbis
  - helios
  - generateWorld
  - generateLiveVideo
  - adapter
---

Reactor gives you live worlds and live video that you steer with prompts while they play. Your server mints a short session token. The browser connects with the token and plays the stream. The adapter has no chat.

- `reactorWorld()` with `generateWorld()`: a world the user can look at and move through.
- `reactorVideo()` with `generateLiveVideo()`: a live video session.

## 1. Install

The server needs `@tanstack/ai-reactor`. The browser needs `@reactor-team/js-sdk` to connect and play the stream.

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

## 2. Set the API key

Create a key in the [Reactor dashboard](https://www.reactor.inc/dashboard). Keys start with `rk_`. Put the key in the environment of your server:

```bash
REACTOR_API_KEY=rk_...
```

`reactorWorld` and `reactorVideo` read `REACTOR_API_KEY`. To pass the key in code, use `createReactorWorld` or `createReactorVideo`:

```ts
import { createReactorWorld } from '@tanstack/ai-reactor'

const adapter = createReactorWorld('visko-orbis-stable', process.env.REACTOR_API_KEY!)
```

## 3. Mint a world session on the server

Add a `POST` route at `/api/world`:

```ts
import { generateWorld } from '@tanstack/ai'
import { reactorWorld } from '@tanstack/ai-reactor'

export async function POST() {
  const world = await generateWorld({
    adapter: reactorWorld('visko-orbis-stable'),
    prompt: 'A neon cyberpunk city at night, slow aerial drift',
  })

  return Response.json({
    token: world.token,
    model: world.model,
    prompt: world.prompt,
    expiresAt: world.expiresAt,
  })
}
```

The token works for this one model only. The API key stays on the server. `world.model` is the Reactor connect slug, here `reactor/visko-orbis-stable`.

## 4. Play the world in the browser

Connect with the token and play the stream in a `<video>` element:

```ts
import { Reactor } from '@reactor-team/js-sdk'

const video = document.querySelector('video')
if (!video) {
  throw new Error('Missing video element')
}

const world = await fetch('/api/world', { method: 'POST' }).then(async (response) => {
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
  video.srcObject = stream
  void video.play()
})

await reactor.connect(token)
await reactor.sendCommand('set_resolution', { resolution: '1080p' })
await reactor.sendCommand('set_prompt', { prompt })
await reactor.sendCommand('start', {})
```

The video element now plays a live world. To steer it, send a new `set_prompt`. For a version that attaches the stream again when a track unmutes, see [World Generation](../media/world-generation).

A full working app is in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media). Open the World or Live tab.

## Live video

Reactor video is a live stream, not a finished file. `generateLiveVideo()` returns a token, the same as `generateWorld()`:

```ts
import { generateLiveVideo } from '@tanstack/ai'
import { reactorVideo } from '@tanstack/ai-reactor'

const live = await generateLiveVideo({
  adapter: reactorVideo('helios'),
  prompt: 'A neon cyberpunk city at night, slow aerial drift',
})
```

Send `live.token`, `live.model`, and `live.prompt` to the browser. Then connect as in step 4, or see [Live Generation](../media/live-generation).

`helios` works with both adapters:

- Use `generateWorld()` for a world that the user moves through.
- Use `generateLiveVideo()` for a video session.

## Models and options

Pass the id as a string literal, so TypeScript can narrow the options. The result `model` is the connect slug. Pass it to `new Reactor({ modelName })`.

### World models

| Id | Connect slug |
| --- | --- |
| `visko-orbis-stable` | `reactor/visko-orbis-stable` |
| `visko-orbis-dynamic` | `reactor/visko-orbis-dynamic` |
| `happy-oyster-adventure` | `reactor/happy-oyster-adventure` |
| `happy-oyster-director` | `reactor/happy-oyster-director` |
| `lingbot-world-2` | `reactor/lingbot-world-2` |
| `lingbot` | `reactor/lingbot` |
| `helios` | `reactor/helios` |

Happy Oyster (`happy-oyster-adventure`, `happy-oyster-director`) uses `createWorld` and `startTravel` after `connect`.

### Live video models

| Id | Connect slug |
| --- | --- |
| `helios` | `reactor/helios` |
| `fast-h3` | `reactor/fast-h3` |
| `longlive-v2` | `reactor/longlive-v2` |
| `ltx2` | `reactor/ltx2` |

The package exports the lists as `REACTOR_WORLD_MODELS`, `REACTOR_VIDEO_MODELS`, `REACTOR_WORLD_SLUGS`, and `REACTOR_VIDEO_SLUGS`.

### Browser session options

`generateWorld()` and `generateLiveVideo()` send only the prompt when they mint the token. They do not send a resolution or a seed image. Keep these options in client state, and send them with `sendCommand` after `connect`. Orbis reads them on the next `start`:

```ts
import { Reactor } from '@reactor-team/js-sdk'

const reactor = new Reactor({ modelName: 'reactor/visko-orbis-stable' })
await reactor.sendCommand('set_resolution', { resolution: '2k' })
await reactor.sendCommand('set_seed', { seed: 42 })
await reactor.sendCommand('set_audio_enabled', { audio_enabled: true })
```

| Option | Command | Meaning |
| --- | --- | --- |
| `resolution` | `set_resolution` | The delivery tier: `1080p`, `2k`, or `4k` |
| `seed` | `set_seed` | The RNG seed for the next run |
| `audioEnabled` | `set_audio_enabled` | When `false`, Reactor does not compute audio |
| `audioPrompt` | `set_audio_prompt` | A description of the sound, or `""` for audio that follows the picture |

## Advanced

### Start from a seed image

Send seed images from the browser after `connect`. Pass a `File` from `<input type="file">`. The SDK uploads it and returns a `FileRef`. Do not send base64.

LingBot starts from a seed image. `start` also needs `set_prompt`. Write the prompt so that it describes what the image shows:

```ts
import { Reactor } from '@reactor-team/js-sdk'

const reactor = new Reactor({ modelName: 'reactor/lingbot' })
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
await reactor.sendCommand('set_prompt', {
  prompt: 'A narrow stone alley at night, wet cobbles, one lit shop window.',
})
await reactor.sendCommand('start', {})
```

Other models:

- **Helios** can take the same `File` with `set_conditioning`, so the prompt and the image arrive together.
- **Orbis** takes an optional seed image. Send `set_image` before `set_prompt` and `start`. Use a 16:9 image, because Orbis resizes other shapes without a crop. A new image during a run has no effect until `reset`.

### Bring your own key

The browser can save a Reactor key and send it in the `x-byok-reactor` header. The server reads that header first, then `REACTOR_API_KEY`:

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
    prompt: 'A neon cyberpunk city at night, slow aerial drift',
  })

  return Response.json({
    token: world.token,
    model: world.model,
    prompt: world.prompt,
    expiresAt: world.expiresAt,
  })
}
```

Do not put the API key in the JSON body. For the browser side, see [Let users bring their own Reactor key](../media/world-generation#let-users-bring-their-own-reactor-key) and [Bring Your Own Key](../advanced/byok).

### Custom endpoint

```ts
import { reactorWorld } from '@tanstack/ai-reactor'

const adapter = reactorWorld('visko-orbis-stable', {
  baseUrl: 'https://api.reactor.inc',
})
```

### API reference

| Factory | Creates |
| --- | --- |
| `reactorWorld(model, config?)` / `createReactorWorld(model, apiKey, config?)` | A world adapter for `generateWorld()` |
| `reactorVideo(model, config?)` / `createReactorVideo(model, apiKey, config?)` | A live video adapter for `generateLiveVideo()` |

The short factory reads `REACTOR_API_KEY` when `config.apiKey` is not set. The `config` fields:

- `apiKey`: the Reactor API key.
- `baseUrl`: the API base URL. The default is `https://api.reactor.inc`.
- `fetch`: your own `fetch` function.
