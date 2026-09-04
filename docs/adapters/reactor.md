---
title: Reactor
id: reactor-adapter
description: "Generate live worlds with Reactor models in TanStack AI via the @tanstack/ai-reactor adapter."
keywords:
  - tanstack ai
  - reactor
  - world generation
  - orbis
  - generateWorld
  - adapter
---

Reactor hosts live world models. You describe a scene. Then you open a session and stream video. You can steer the stream with a new prompt. This adapter is for `generateWorld()`. It does not support `chat()`.

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

Peer dependency: `@tanstack/ai`. The browser also needs `@reactor-team/js-sdk` to connect and play the stream. See [World Generation](../media/world-generation).

A full working app is in [`examples/ts-react-world`](https://github.com/TanStack/ai/tree/main/examples/ts-react-world).

## API key

Create a key in the [Reactor dashboard](https://www.reactor.inc/dashboard). Keys start with `rk_`. Set `REACTOR_API_KEY` on the server, or pass `apiKey` to the adapter.

```ts
import { generateWorld } from '@tanstack/ai'
import { reactorWorld } from '@tanstack/ai-reactor'

const apiKey = process.env.REACTOR_API_KEY
if (!apiKey) {
  throw new Error('REACTOR_API_KEY is not set')
}

const world = await generateWorld({
  adapter: reactorWorld('visko-orbis-stable', { apiKey }),
  prompt: 'A neon cyberpunk city at night, slow aerial drift',
})
```

The adapter mints a **session-scoped** token for that model only. Hand `world.token`, `world.model`, and `world.prompt` to the browser. Do not send the API key.

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

## Provider options

Orbis reads these on the next `start`. Put them in `modelOptions`. The browser applies them with `sendCommand` before `start`.

```ts
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
const adapter = reactorWorld('visko-orbis-stable', {
  apiKey,
  baseUrl: 'https://api.reactor.inc',
})
```

## What you have now

A server call that mints a scoped Reactor token for one world model. Next: connect in the browser as shown in [World Generation](../media/world-generation).
