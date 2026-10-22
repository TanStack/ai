---
title: World Labs
id: worldlabs-adapter
description: "Make finished 3D Marble worlds with World Labs in TanStack AI with @tanstack/ai-worldlabs: a viewer URL, splat files, and a mesh from a prompt, an image, or a video."
keywords:
  - tanstack ai
  - worldlabs
  - world labs
  - marble
  - world generation
  - generateWorld
  - adapter
---

`generateWorld()` calls World Labs Marble. A prompt, image, or video returns a viewer URL, and often splat files, a mesh, and a panorama. The adapter has no chat.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-worldlabs
vue: @tanstack/ai @tanstack/ai-worldlabs
solid: @tanstack/ai @tanstack/ai-worldlabs
svelte: @tanstack/ai @tanstack/ai-worldlabs
preact: @tanstack/ai @tanstack/ai-worldlabs
angular: @tanstack/ai @tanstack/ai-worldlabs
vanilla: @tanstack/ai @tanstack/ai-worldlabs
octane: @tanstack/ai @tanstack/ai-worldlabs

<!-- ::end:tabs -->

## 2. Set the API key

Create a key in the [World Labs platform](https://platform.worldlabs.ai/api-keys). Put it in the environment of your server:

```bash
WORLDLABS_API_KEY=your-worldlabs-key
```

`worldlabsWorld` reads `WORLDLABS_API_KEY`. To pass the key in code, use `createWorldLabsWorld`:

```ts
import { createWorldLabsWorld } from '@tanstack/ai-worldlabs'

const adapter = createWorldLabsWorld('marble-1.1', process.env.WORLDLABS_API_KEY!)
```

## 3. Generate a world on the server

Add a `POST` route at `/api/world`. The call waits until the world is ready, so give it a long `timeout`:

```ts
import { generateWorld } from '@tanstack/ai'
import { worldlabsWorld } from '@tanstack/ai-worldlabs'

export async function POST() {
  const world = await generateWorld({
    adapter: worldlabsWorld('marble-1.1'),
    prompt: 'A mystical forest with glowing mushrooms',
    threadId: 'thread-1',
    timeout: 10 * 60 * 1000,
  })

  return Response.json({
    url: world.url,
    thumbnailUrl: world.assets?.thumbnailUrl,
  })
}
```

World Labs bills in credits for each generation.

## 4. Show the world in the browser

`world.url` is the Marble viewer (`https://marble.worldlabs.ai/world/{id}`). Open it in a new tab. Do not put it in an iframe:

```ts
const world = await fetch('/api/world', { method: 'POST' }).then((response) =>
  response.json(),
)

if (typeof world.url === 'string') {
  const link = document.createElement('a')
  link.href = world.url
  link.target = '_blank'
  link.textContent = 'Open in Marble'
  document.body.append(link)
}

if (typeof world.thumbnailUrl === 'string') {
  const image = document.createElement('img')
  image.src = world.thumbnailUrl
  image.alt = 'Preview of the generated world'
  document.body.append(image)
}
```

You now have a 3D world and a link to explore it.

A full app is in [`examples/ts-react-media`](https://github.com/TanStack/ai/tree/main/examples/ts-react-media). Open the World tab and pick a Marble model. The example loads one SPZ splat file in Spark (it prefers `500k`) through `/api/marble-splat`. If there is no splat URL, it shows a thumbnail and an Open in Marble link.

## Image, multi-image, and video

`prompt` is the text. Put the media in `modelOptions`:

```ts
import { generateWorld } from '@tanstack/ai'
import { worldlabsWorld } from '@tanstack/ai-worldlabs'

const world = await generateWorld({
  adapter: worldlabsWorld('marble-1.1'),
  prompt: 'A cozy living room',
  threadId: 'thread-1',
  modelOptions: {
    image: { uri: 'https://example.com/room.jpg' },
    isPano: 'auto',
  },
})
```

Pass only one of `image`, `images`, or `video`. See [Media options](#media-options) for each field.

## Models and options

Pass the id as a string literal, so TypeScript can narrow the options.

| Id | Notes |
| --- | --- |
| `marble-1.1-plus` | Dynamic world sizing |
| `marble-1.1` | The World Labs default model id |
| `marble-1.0` | Marble 1.0 |
| `marble-1.0-draft` | Faster, at draft quality |

The package exports the list as `WORLDLABS_WORLD_MODELS`.

### Media options

| Option | Meaning |
| --- | --- |
| `image` | One image. Give `uri`, `mediaAssetId`, or `dataBase64` |
| `images` | Several images of the same scene, each with an optional `azimuth` |
| `video` | One video. The same source fields as `image` |
| `isPano` | `auto`, `true`, or `false`, for a single image |

### Job options

| Option | Meaning |
| --- | --- |
| `wait` | The default is `true`. Set `false` to get the `operationId` at once |
| `pollIntervalMs` | The delay between polls when `wait` is `true`. The default is 2000 |

Optional metadata: `displayName`, `seed`, `tags`, `disableRecaption`, and `permission`.

## Advanced

### What the result holds

- `world.url`: the Marble viewer URL.
- `world.assets`: optional. It has splat, mesh, panorama, and thumbnail links only when the World Labs response includes them. These URLs are often signed CDN links.
- `world.assets.splats.spzUrls`: splat URLs by quality key, for example `100k`, `500k`, and `full_res`.

### Jobs that do not wait

On serverless, a job that runs for minutes can hit the limit of your platform. You have two choices:

- Pass a long `timeout` to `generateWorld()`, as in step 3.
- Set `modelOptions: { wait: false }` and poll the job yourself.

With `wait: false`, `world.status` is `waiting` and `world.operationId` is set. The adapter cannot resume that id. A new `generateWorld()` call with `wait: true` starts a new job. To get the result, poll `GET /marble/v1/operations/{operationId}` yourself.

### Bring your own key

`worldlabsByok` from `@tanstack/ai-worldlabs/byok` declares World Labs for the BYOK store, with `WORLDLABS_API_KEY` as its env var. See [Bring Your Own Key](../advanced/byok).

### API reference

| Factory | Creates |
| --- | --- |
| `worldlabsWorld(model, config?)` | A world adapter. Reads `WORLDLABS_API_KEY` when `config.apiKey` is not set. |
| `createWorldLabsWorld(model, apiKey, config?)` | The same adapter with an explicit API key. |

The `config` fields:

- `apiKey`: the World Labs API key.
- `baseUrl`: the API base URL. The default is `https://api.worldlabs.ai`.
- `defaultHeaders`: extra request headers.
- `fetch`: your own `fetch` function.
