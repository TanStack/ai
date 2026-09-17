---
title: World Labs
id: worldlabs-adapter
description: "Generate persistent 3D Marble worlds with World Labs in TanStack AI via the @tanstack/ai-worldlabs adapter."
keywords:
  - tanstack ai
  - worldlabs
  - world labs
  - marble
  - world generation
  - generateWorld
  - adapter
---

You want a finished 3D world from a prompt, an image, or a video. World Labs Marble generates splat files, a mesh, and a viewer URL. Generation often takes several minutes.

Use `worldlabsWorld()` with `generateWorld()`. This adapter does not support `chat()`.

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-worldlabs
vue: @tanstack/ai-worldlabs
solid: @tanstack/ai-worldlabs
svelte: @tanstack/ai-worldlabs
preact: @tanstack/ai-worldlabs
angular: @tanstack/ai-worldlabs
vanilla: @tanstack/ai-worldlabs
octane: @tanstack/ai-worldlabs

<!-- ::end:tabs -->

Peer dependency: `@tanstack/ai`. A full working app is in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media). Open the World tab and pick a Marble model.

## API key

Create a key in the [World Labs platform](https://platform.worldlabs.ai/api-keys). Set `WORLDLABS_API_KEY`, or pass `apiKey`.

```ts
import { generateWorld } from '@tanstack/ai'
import { worldlabsWorld } from '@tanstack/ai-worldlabs'

const world = await generateWorld({
  adapter: worldlabsWorld('marble-1.1'),
  prompt: 'A mystical forest with glowing mushrooms',
})
```

To pass a key explicitly:

```ts
const adapter = worldlabsWorld('marble-1.1', {
  apiKey: process.env.WORLDLABS_API_KEY!,
})
```

`world.url` is the Marble viewer URL (`https://marble.worldlabs.ai/world/{id}`). Do not iframe it. `world.assets` is optional. Splat, mesh, panorama, and thumbnail links appear only when the World Labs response includes them. Those URLs are often signed CDN links.

World Labs bills in credits per generation. The call waits until the world is ready (often several minutes). Pass a long `timeout` on serverless, or set `wait: false` and poll later.

## Models

Pass a string literal so TypeScript can narrow options.

```ts
import { worldlabsWorld } from '@tanstack/ai-worldlabs'

const adapter = worldlabsWorld('marble-1.1')
```

| Id | Notes |
| --- | --- |
| `marble-1.1-plus` | Dynamic world sizing |
| `marble-1.1` | World Labs default model id |
| `marble-1.0` | Marble 1.0 |
| `marble-1.0-draft` | Faster draft quality |

## Image, multi-image, and video

The `prompt` argument is the text. Put media on `modelOptions`.

```ts
import { generateWorld } from '@tanstack/ai'
import { worldlabsWorld } from '@tanstack/ai-worldlabs'

const world = await generateWorld({
  adapter: worldlabsWorld('marble-1.1'),
  prompt: 'A cozy living room',
  modelOptions: {
    image: { uri: 'https://example.com/room.jpg' },
    isPano: 'auto',
  },
})
```

Pass only one of `image`, `images`, or `video`.

| Option | Meaning |
| --- | --- |
| `image` | One image. `uri`, `mediaAssetId`, or `dataBase64` |
| `images` | Several images of the same scene, each with optional `azimuth` |
| `video` | One video. Same source fields as `image` |
| `isPano` | `auto`, `true`, or `false` for a single image |
| `wait` | Default `true`. Set `false` to return `operationId` at once |
| `pollIntervalMs` | Poll delay when `wait` is true. Default 2000 |

Optional metadata: `displayName`, `seed`, `tags`, `disableRecaption`, `permission`.

When `wait` is `false`, `world.status` is `waiting` and `world.operationId` is set. This adapter cannot resume that id. Call `generateWorld` again with `wait: true` only starts a new job. Poll `GET /marble/v1/operations/{operationId}` yourself, or keep `wait` at the default.

## What you have now

A server call that generates a Marble world and returns the viewer URL plus optional asset links. The media example picks one SPZ (prefers `500k`) and loads it in Spark through `/api/marble-splat`. If no splat URL is present, it shows a thumbnail and an Open in Marble link.
