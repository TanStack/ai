---
title: Mynth
id: mynth-adapter
description: "Generate images with Mynth models like Flux, Recraft, Gemini, Qwen, Seedream, Wan, and Grok Imagine in TanStack AI via the Mynth community adapter."
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

# Mynth

The Mynth adapter gives you access to Mynth image generation models through TanStack AI. It is a community adapter for `generateImage()` with typed model IDs, normalized image results, image-to-image support, and Mynth-specific request options through `modelOptions`.

Mynth is image-only in this package. Reach for it when you want TanStack AI's image generation workflow with Mynth models such as Flux, Recraft, Gemini, Qwen, Seedream, Wan, and Grok Imagine.

Quick note: Mynth is in public beta, so the model lineup and a few request options are still settling. The adapter tracks the Mynth SDK closely, and we welcome feedback on the API and integration experience.

## Installation

```sh
# bun
bun add @mynthio/tanstack-ai-adapter @tanstack/ai

# pnpm
pnpm add @mynthio/tanstack-ai-adapter @tanstack/ai

# npm
npm install @mynthio/tanstack-ai-adapter @tanstack/ai
```

The adapter targets `@tanstack/ai` 0.34 and newer.

## Authentication

Set your Mynth API key in the environment:

```sh
MYNTH_API_KEY=mak_...
```

Keep `MYNTH_API_KEY` on the server only. Never expose it in browser code or public client environment variables, or it may end up in a client bundle.

You can also pass `apiKey` directly in the adapter config. `baseUrl` is optional and useful for proxies, tests, or custom deployments.

If you need a key, create one in the [Mynth API keys dashboard](https://mynth.io/dashboard/keys).

## Quick Start

```ts
import { generateImage } from "@tanstack/ai";
import { mynthImage } from "@mynthio/tanstack-ai-adapter";

const result = await generateImage({
  adapter: mynthImage("black-forest-labs/flux.2-dev"),
  prompt: "Editorial product photo of a ceramic mug on a linen tablecloth",
  numberOfImages: 1,
  size: "square",
});

console.log(result.id);
console.log(result.model);
console.log(result.images[0]?.url);
```

TanStack AI adapters are model-bound, so you choose the Mynth model when you create the adapter.

## Reusable Provider

Use `createMynthImage()` when you want to share config across multiple adapters:

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
});

console.log(result.images[0]?.url);
```

You can still override shared config per adapter:

```ts
import { createMynthImage } from "@mynthio/tanstack-ai-adapter";

const mynth = createMynthImage();

const adapter = mynth("auto", {
  baseUrl: "https://proxy.example.com",
});
```

## Model Options

Use TanStack's top-level fields for common options such as `prompt`, `numberOfImages`, and shorthand `size`. Use `modelOptions` for Mynth-specific options:

```ts
import { generateImage } from "@tanstack/ai";
import { mynthImage } from "@mynthio/tanstack-ai-adapter";

const result = await generateImage({
  adapter: mynthImage("recraft/recraft-v4"),
  prompt: "Modern poster design for a jazz festival",
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

Notes:

- `modelOptions.negativePrompt` maps to Mynth's `negative_prompt`, and `modelOptions.magicPrompt` maps to `magic_prompt`
- `modelOptions.rating` configures content rating on the result. The older `contentRating` name still works as an alias
- `modelOptions.promptStructured` is still supported for compatibility and expands into `prompt`, `negative_prompt`, and `magic_prompt`. When set, its `positive` overrides the plain `prompt`
- `modelOptions.size` overrides the top-level `size`. Use it when you need structured Mynth size objects, including aspect ratios and an optional `scale: "4k"`
- Top-level `size` is for shorthand values such as `"auto"` and preset strings like `"square"` or `"landscape"`
- `modelOptions.destination` delivers the generation to a configured Mynth destination, overriding any adapter-level or env default

## Image Inputs (image-to-image)

Models that accept image inputs work with TanStack AI's content-part prompts, so you can mix instruction text with reference images for image-to-image, reference-guided, edit, and try-on flows. The adapter maps the image parts onto Mynth's `inputs`:

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
});
```

A few things worth knowing:

- Only models in `MYNTH_IMAGE_INPUT_MODELS` accept image parts. Passing image parts to a text-only model is a compile-time error
- Both URL sources (`{ type: "url", value }`) and inline data sources (`{ type: "data", value, mimeType }`, encoded as a data URI) are supported
- A part's `metadata.role` maps to Mynth's input intent. TanStack's `"character"` maps directly, and the other generic roles fall back to Mynth's automatic detection
- For Mynth's finer-grained intents (`person`, `garment`, `pose`, `style`, `background`, `product`, `object`), pass `modelOptions.inputs` with an explicit `as`
- Image parts from the prompt and entries in `modelOptions.inputs` are combined, with prompt parts first

## Available Models

The adapter exports a runtime list and a type union for supported image models:

```ts
import { MYNTH_IMAGE_MODELS, type MynthImageModel } from "@mynthio/tanstack-ai-adapter";

const defaultModel: MynthImageModel = "auto";

for (const model of MYNTH_IMAGE_MODELS) {
  console.log(model);
}
```

This is handy for model selectors, validation, and keeping client and server code in sync. There is a matching `MYNTH_IMAGE_INPUT_MODELS` list (and `MynthImageInputModel` type) for the subset that accepts image inputs.

Mynth supports model IDs across multiple providers, including `auto`, Flux, Recraft, Gemini, Qwen, Seedream, Imagine, Wan, Grok Imagine, and try-on models. The exported list is a fixed snapshot for type safety. For the live catalog with pricing, use the models endpoint below.

### Models endpoint

Mynth exposes a public catalog at `https://api.mynth.io/models`. It does not require an API key, and it carries pricing today with room for more metadata over time. This is the source of truth if you want to render a picker with live pricing rather than the static exported list.

```ts
const response = await fetch("https://api.mynth.io/models");
const { data } = await response.json();

for (const model of data) {
  console.log(model.id, model.displayName, model.pricing);
}
```

Each entry looks roughly like this:

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

If you already use the Mynth SDK, the same data is available through `new Mynth().models.list()`.

## Streaming Example

This adapter also works with TanStack AI's streaming image workflow:

```ts
import { generateImage, toServerSentEventsResponse } from "@tanstack/ai";
import { mynthImage } from "@mynthio/tanstack-ai-adapter";

export async function POST(request: Request) {
  const { prompt, model } = await request.json();

  const stream = generateImage({
    adapter: mynthImage(model ?? "auto"),
    prompt,
    numberOfImages: 1,
    stream: true,
  });

  return toServerSentEventsResponse(stream);
}
```

For a full example using `useGenerateImage()`, see the [TanStack Start + Mynth adapter demo](https://github.com/mynthio/oss/tree/main/examples/tanstack-start-ai-mynth-adapter).

## Supported Capabilities

- Image generation with `generateImage()`
- Image-to-image with content-part prompts on input-capable models
- Streaming image generation with `stream: true`
- Typed model IDs through `MYNTH_IMAGE_MODELS` and `MynthImageModel`
- Mynth-specific request options through `modelOptions`

The adapter returns TanStack AI's normalized image result shape:

- `id`: the Mynth task id
- `model`: the resolved model returned by Mynth, or the requested model as a fallback
- `images`: only successful images are included
- `images[*].revisedPrompt`: included when Mynth enhances the prompt

## API Reference

### `mynthImage(model, config?)`

Creates a Mynth image adapter directly.

- `model`: a `MynthImageModel`
- `config.apiKey?`: optional override for `MYNTH_API_KEY`
- `config.baseUrl?`: optional base URL override
- `config.destination?`: optional default destination for generated images

Returns a `MynthImageAdapter` for use with `generateImage()`.

### `createMynthImage(config?)`

Creates a reusable provider factory that returns model-bound adapters.

### `MYNTH_IMAGE_MODELS`

Readonly array of supported Mynth image model IDs.

### `MynthImageModel`

Type union of supported Mynth image model IDs.

### `MYNTH_IMAGE_INPUT_MODELS`

Readonly array of model IDs that accept image inputs (image-to-image, try-on).

### `MynthImageInputModel`

Type union of the model IDs that accept image inputs.

## Limitations

- This package only provides an image adapter for `generateImage()`
- It does not provide chat or text-generation adapters

## Next Steps

- [Mynth SDK README](https://github.com/mynthio/oss/tree/main/packages/sdk)
- [TanStack Start + Mynth adapter demo](https://github.com/mynthio/oss/tree/main/examples/tanstack-start-ai-mynth-adapter)
- [Mynth](https://mynth.io)
