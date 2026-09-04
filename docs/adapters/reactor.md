---
title: Reactor
id: reactor-adapter
description: "Generate live worlds and video with Reactor models in TanStack AI via the @tanstack/ai-reactor adapter."
keywords:
  - tanstack ai
  - reactor
  - world generation
  - live generation
  - orbis
  - helios
  - generateWorld
  - generateLive
  - adapter
---

Reactor hosts live world and video models. You describe a scene. Then you open a session and stream video. You can steer the stream with a new prompt.

Use `reactorWorld()` with `generateWorld()` for navigable worlds. Use `reactorVideo()` with `generateLive()` for live video models. Both mint a session token. Neither supports `chat()`.

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-reactor
vue: @tanstack/ai-reactor
solid: @tanstack/ai-reactor
svelte: @tanstack/ai-reactor
preact: @tanstack/ai-reactor
angular: @tanstack/ai-reactor
vanilla: @tanstack/ai-reactor
octane: @tanstack/ai-reactor

<!-- ::end:tabs -->

Peer dependency: `@tanstack/ai`. The browser also needs `@reactor-team/js-sdk` to connect and play the stream. See [World Generation](../media/world-generation) and [Live Generation](../media/live-generation).

A full working app is in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media). Open the World or Live tab.

## API key

Create a key in the [Reactor dashboard](https://www.reactor.inc/dashboard). Keys start with `rk_`.

The example app uses [Bring Your Own Key](../advanced/byok). The browser pastes the key. The relay reads `x-byok-reactor`, then `REACTOR_API_KEY`.

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

The adapter mints a **session-scoped** token for that model only. Hand `world.token`, `world.model`, and `world.prompt` to the browser. Do not put the API key in the JSON body.

## Models

Pass a string literal so TypeScript can narrow options.

```ts
import { reactorWorld } from '@tanstack/ai-reactor'

const adapter = reactorWorld('visko-orbis-stable')
```

| Id | Connect slug |
| --- | --- |
| `visko-orbis-stable` | `reactor/visko-orbis-stable` |
| `visko-orbis-dynamic` | `reactor/visko-orbis-dynamic` |
| `happy-oyster-adventure` | `reactor/happy-oyster-adventure` |
| `happy-oyster-director` | `reactor/happy-oyster-director` |
| `lingbot-world-2` | `reactor/lingbot-world-2` |
| `lingbot` | `reactor/lingbot` |
| `helios` | `reactor/helios` |

`world.model` is the connect slug. Pass it to `new Reactor({ modelName })`.

## Live video

Reactor video is a live stream, not a finished file. `generateLive()` returns a token. The browser connects, sets the prompt, and plays the track.

```ts
import { generateLive } from '@tanstack/ai'
import { reactorVideo } from '@tanstack/ai-reactor'

const apiKey = process.env.REACTOR_API_KEY ?? ''
const live = await generateLive({
  adapter: reactorVideo('helios', { apiKey }),
  prompt: 'A neon cyberpunk city at night, slow aerial drift',
})
```

Hand `live.token`, `live.model`, and `live.prompt` to the browser. Connect as shown in [Live Generation](../media/live-generation).

| Id | Connect slug |
| --- | --- |
| `helios` | `reactor/helios` |
| `fast-h3` | `reactor/fast-h3` |
| `visko-orbis-stable` | `reactor/visko-orbis-stable` |
| `visko-orbis-dynamic` | `reactor/visko-orbis-dynamic` |
| `longlive-v2` | `reactor/longlive-v2` |
| `ltx2` | `reactor/ltx2` |

`helios` and Orbis also work with `reactorWorld()`. Pick `generateLive()` when you want a video session. Pick `generateWorld()` when you want a navigable world.

Pass a text prompt only. Set a reference image in the browser with `uploadFile` and `set_image` after connect.

## Provider options

Orbis reads these on the next `start`. Put them in `modelOptions`. The browser applies them with `sendCommand` before `start`.

```ts
import { generateWorld } from '@tanstack/ai'
import { reactorWorld } from '@tanstack/ai-reactor'

const world = await generateWorld({
  adapter: reactorWorld('visko-orbis-stable'),
  prompt: 'Black volcanic cliffs, slow aerial camera',
  modelOptions: {
    resolution: '2k',
    seed: 42,
    audioEnabled: true,
  },
})
```

| Option | Meaning |
| --- | --- |
| `resolution` | `1080p`, `2k`, or `4k` delivery tier |
| `seed` | RNG seed for the next run |
| `audioEnabled` | When `false`, skip audio compute |
| `audioPrompt` | Sound description, or `""` for picture-driven audio |

## Custom endpoint

```ts
import { reactorWorld } from '@tanstack/ai-reactor'

const apiKey = process.env.REACTOR_API_KEY ?? ''
const adapter = reactorWorld('visko-orbis-stable', {
  apiKey,
  baseUrl: 'https://api.reactor.inc',
})
```

## What you have now

A server call that mints a scoped Reactor token for one world or video model. Next: connect in the browser as shown in [World Generation](../media/world-generation) or [Live Generation](../media/live-generation).
