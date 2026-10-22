---
title: Mynth
id: mynth-adapter
description: "Generate images with Mynth models (Flux, Recraft, Gemini, Qwen, Seedream, Wan, Grok Imagine) in TanStack AI through the Mynth community adapter."
keywords:
  - tanstack ai
  - mynth
  - image generation
  - flux
  - recraft
  - qwen
  - seedream
  - community adapter
---

The Mynth community adapter calls Flux, Recraft, Gemini, Qwen, Seedream, Wan, and Grok Imagine from `generateImage()`. Mynth maintains it.

> [!NOTE]
> Mynth is in public beta. The model list and some request options can still change. The adapter follows the Mynth SDK closely, and Mynth welcomes feedback on the API.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @mynthio/tanstack-ai-adapter @tanstack/ai
vue: @mynthio/tanstack-ai-adapter @tanstack/ai
solid: @mynthio/tanstack-ai-adapter @tanstack/ai
svelte: @mynthio/tanstack-ai-adapter @tanstack/ai
preact: @mynthio/tanstack-ai-adapter @tanstack/ai
angular: @mynthio/tanstack-ai-adapter @tanstack/ai
vanilla: @mynthio/tanstack-ai-adapter @tanstack/ai
octane: @mynthio/tanstack-ai-adapter @tanstack/ai

<!-- ::end:tabs -->

The adapter needs `@tanstack/ai` 0.34 or later.

## 2. Set the API key

Make a key in the [Mynth API keys dashboard](https://mynth.io/dashboard/keys). Then put it in the environment of your server:

```sh
MYNTH_API_KEY=mak_...
```

> [!WARNING]
> Keep `MYNTH_API_KEY` on the server. Do not put it in browser code or in public client environment variables. It can then end up in a client bundle.

## 3. Generate an image

```ts
import { generateImage } from "@tanstack/ai";
import { mynthImage } from "@mynthio/tanstack-ai-adapter";

const result = await generateImage({
  adapter: mynthImage("black-forest-labs/flux.2-dev"),
  prompt: "Editorial product photo of a ceramic mug on a linen tablecloth",
  threadId: "thread-1",
  numberOfImages: 1,
  size: "square",
});

console.log(result.id);
console.log(result.model);
console.log(result.images[0]?.url);
```

You get a URL to the image in `result.images[0]?.url`. You pick the Mynth model when you create the adapter.

## 4. Stream it to your UI

Return the generation from a route with `stream: true`:

```ts
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from "@tanstack/ai";
import { mynthImage } from "@mynthio/tanstack-ai-adapter";

export async function POST(request: Request) {
  const { input, threadId, runId } = await generationParamsFromRequest(
    "image",
    request,
  );

  const stream = generateImage({
    adapter: mynthImage("auto"),
    prompt: input.prompt,
    threadId,
    runId,
    numberOfImages: 1,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

On the client, use `useGenerateImage()`. For a full app, see the [TanStack Start + Mynth adapter demo](https://github.com/mynthio/oss/tree/main/examples/tanstack-start-ai-mynth-adapter).

## Image to image

Models that take image input work with content-part prompts. Mix the instruction text with reference images, for restyles, edits, reference-guided images, and try-on:

```ts
import { generateImage } from "@tanstack/ai";
import { mynthImage } from "@mynthio/tanstack-ai-adapter";

const result = await generateImage({
  adapter: mynthImage("black-forest-labs/flux.2-dev"),
  prompt: [
    { type: "text", content: "Restyle this scene as a watercolor painting" },
    {
      type: "image",
      source: { type: "url", value: "https://example.com/photo.jpg" },
    },
  ],
  threadId: "thread-1",
});
```

The adapter maps the image parts to Mynth `inputs`:

- Only models in `MYNTH_IMAGE_INPUT_MODELS` take image parts. An image part for another model is a compile-time error.
- URL sources (`{ type: "url", value }`) and inline data sources (`{ type: "data", value, mimeType }`, sent as a data URI) both work.
- The `metadata.role` of a part maps to the Mynth input intent. TanStack's `"character"` maps directly. The other roles use the automatic detection of Mynth.
- For the finer Mynth intents (`person`, `garment`, `pose`, `style`, `background`, `product`, `object`), pass `modelOptions.inputs` with an explicit `as`.
- The adapter combines the image parts of the prompt and the entries in `modelOptions.inputs`. Prompt parts come first.

## Share settings across adapters

Use `createMynthImage()` to share settings across adapters:

```ts
import { generateImage } from "@tanstack/ai";
import { createMynthImage } from "@mynthio/tanstack-ai-adapter";

const mynth = createMynthImage({
  apiKey: process.env.MYNTH_API_KEY!,
  baseUrl: "https://api.mynth.io",
});

const result = await generateImage({
  adapter: mynth("google/gemini-3.1-flash-image"),
  prompt: "A playful paper-cut illustration of a city park in spring",
  threadId: "thread-1",
});

console.log(result.images[0]?.url);
```

You can still change the settings for one adapter:

```ts
import { createMynthImage } from "@mynthio/tanstack-ai-adapter";

const mynth = createMynthImage();

const adapter = mynth("auto", {
  baseUrl: "https://proxy.example.com",
});
```

- `apiKey` overrides `MYNTH_API_KEY`.
- `baseUrl` is optional. Use it for proxies, tests, or custom deployments.

## Models and options

### Models

The adapter exports a runtime list and a type of the image models:

```ts
import { MYNTH_IMAGE_MODELS, type MynthImageModel } from "@mynthio/tanstack-ai-adapter";

const defaultModel: MynthImageModel = "auto";

for (const model of MYNTH_IMAGE_MODELS) {
  console.log(model);
}
```

- Use the list for model pickers, validation, and to keep the client and the server in sync.
- `MYNTH_IMAGE_INPUT_MODELS` (and the `MynthImageInputModel` type) lists the models that take image input.
- The models include `auto`, Flux, Recraft, Gemini, Qwen, Seedream, Imagine, Wan, Grok Imagine, and try-on models.

The exported list is a fixed snapshot, for type safety. For the live catalog with prices, use the [models endpoint](#models-endpoint).

### Model options

Top-level fields hold the common options: `prompt`, `numberOfImages`, and the short `size`. Put the Mynth options in `modelOptions`:

```ts
import { generateImage } from "@tanstack/ai";
import { mynthImage } from "@mynthio/tanstack-ai-adapter";

const result = await generateImage({
  adapter: mynthImage("recraft/recraft-v4"),
  prompt: "Modern poster design for a jazz festival",
  threadId: "thread-1",
  numberOfImages: 2,
  size: "portrait",
  modelOptions: {
    negativePrompt: "watermark, blurry text",
    magicPrompt: true,
    size: {
      type: "aspect_ratio",
      aspectRatio: "4:5",
      scale: "4k",
    },
    output: {
      format: "png",
      quality: 90,
    },
    rating: true,
    metadata: {
      requestId: "req_123",
    },
  },
});
```

- `negativePrompt` maps to `negative_prompt`. `magicPrompt` maps to `magic_prompt`.
- `rating` sets content rating on the result. `contentRating` is an alias.
- `size` overrides the top-level `size`. Use it for Mynth size objects, with aspect ratios and an optional `scale: "4k"`. The top-level `size` takes short values such as `"auto"`, `"square"`, or `"landscape"`.
- `destination` sends the generation to a Mynth destination. It overrides the adapter default and the env default.
- `promptStructured` expands into `prompt`, `negative_prompt`, and `magic_prompt`. When you set it, its `positive` overrides the plain `prompt`.

### The result

The adapter returns the normalized image result of TanStack AI:

- `id`: the Mynth task id.
- `model`: the model that Mynth used, or the requested model if Mynth returned none.
- `images`: only the images that succeeded.
- `images[*].revisedPrompt`: set when Mynth improves the prompt.

### API

| Export | What it is |
| --- | --- |
| `mynthImage(model, config?)` | Creates an image adapter. `config.apiKey` overrides `MYNTH_API_KEY`. `config.baseUrl` overrides the base URL. `config.destination` sets a default destination. |
| `createMynthImage(config?)` | Creates a factory that returns adapters for a model. |
| `MYNTH_IMAGE_MODELS` | A readonly array of the image model ids. |
| `MynthImageModel` | The type of the image model ids. |
| `MYNTH_IMAGE_INPUT_MODELS` | A readonly array of the model ids that take image input (image to image, try-on). |
| `MynthImageInputModel` | The type of the model ids that take image input. |

This package has only an image adapter for `generateImage()`. It has no chat or text adapter.

## Advanced

### Models endpoint

Mynth has a public catalog at `https://api.mynth.io/models`. It needs no API key, and it has the prices. Use it for a model picker with live prices:

```ts
const response = await fetch("https://api.mynth.io/models");
const { data } = await response.json();

for (const model of data) {
  console.log(model.id, model.displayName, model.pricing);
}
```

Each entry looks about like this:

```jsonc
{
  "id": "black-forest-labs/flux.2-dev",
  "displayName": "FLUX.2 Dev",
  "pricing": {
    "perImage": { "base": "0.01", "4k": "0.04" },
    "perInput": "0.002",
  },
}
```

With the Mynth SDK, `new Mynth().models.list()` gives the same data. See the [Mynth SDK README](https://github.com/mynthio/oss/tree/main/packages/sdk) and [Mynth](https://mynth.io).
