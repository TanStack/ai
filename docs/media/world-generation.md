---
title: World Generation
id: world-generation
order: 7
description: "Open a live, prompt-steerable world session with generateWorld(). Mint a token on the server, connect in the browser, and steer the stream with new prompts."
keywords:
  - tanstack ai
  - world generation
  - generateWorld
  - reactor
  - orbis
  - infinite world
  - live video
  - experimental
---

# World Generation (Experimental)

You want a world that generates while the viewer watches or changes the prompt. A finite video job stops. `generateWorld()` opens a live session instead.

Call `generateWorld()` on the server. It returns a short-lived token, a model slug, and the prompt. The browser connects, sets the prompt, and starts the stream.

> **Experimental.** The API can change. World models bill per session-second while a GPU is held.

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

```ts
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
  video.srcObject = stream
  void video.play().catch(() => {})
})

await reactor.connect(token)
await reactor.sendCommand('set_prompt', { prompt })
await reactor.sendCommand('start', {})
```

The video element now plays a live world. A new `set_prompt` during the run morphs the scene at the next chunk.

## Models

`reactorWorld()` accepts these ids. The result `model` field is the Reactor connect slug.

| Id | Connect slug | What it does |
| --- | --- | --- |
| `visko-orbis-stable` | `reactor/visko-orbis-stable` | Steerable video with realtime audio |
| `visko-orbis-dynamic` | `reactor/visko-orbis-dynamic` | Same family, live resolution switch |
| `happy-oyster-adventure` | `reactor/happy-oyster-adventure` | Explorable world, held controls |
| `lingbot-world-2` | `reactor/lingbot-world-2` | Image-anchored navigable world |
| `helios` | `reactor/helios` | Interactive realtime video |

See the [Reactor adapter](../adapters/reactor) for API keys, token scope, and provider options. Helios and Orbis also work with `generateLive()` and `reactorVideo()`. See [Live Generation](./live-generation).

A full app lives in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media). Open the World tab.

## What you have now

A server route that mints a world session, and a browser that streams it. Change the prompt while the video plays to steer the world.
