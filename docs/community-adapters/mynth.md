---
title: Mynth
id: mynth-adapter
description: "Generate images with Mynth models — Flux, Recraft, Gemini, Qwen, Seedream, Wan, and Grok Imagine — in TanStack AI via the Mynth community adapter."
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

> **Alpha:** Mynth is currently in public alpha. We are publishing TanStack AI adapters early to gather feedback on the API, supported models, and integration experience while the platform is still evolving.

The Mynth adapter provides access to Mynth image generation models through TanStack AI. It is a community adapter for `generateImage()` with typed model IDs, normalized image results, and support for Mynth-specific request options through `modelOptions`.

Mynth is image-only in this package. Use it when you want TanStack AI's image generation workflow with Mynth models such as Flux, Recraft, Gemini, Qwen, Seedream, Wan, and Grok Imagine.

## Installation

```sh
# bun
bun add @mynthio/tanstack-ai-adapter @tanstack/ai

# pnpm
pnpm add @mynthio/tanstack-ai-adapter @tanstack/ai

# npm
npm install @mynthio/tanstack-ai-adapter @tanstack/ai
```

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
  size: "1024x1024",
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
  prompt: "Ignored when promptStructured is provided",
  numberOfImages: 2,
  size: "1024x1024",
  modelOptions: {
    promptStructured: {
      positive: "Modern poster design for a jazz festival",
      negative: "watermark, blurry text",
      enhance: "prefer_magic",
    },
    size: {
      type: "aspect_ratio",
      aspectRatio: "4:5",
      scale: "2k",
    },
    output: {
      format: "png",
      quality: 90,
    },
    inputs: ["https://example.com/reference-image.jpg"],
    webhook: {
      enabled: true,
    },
    contentRating: {
      enabled: true,
    },
    metadata: {
      requestId: "req_123",
    },
  },
});
```

Notes:

- `modelOptions.promptStructured` overrides the plain `prompt`
- `modelOptions.size` overrides the top-level `size`
- Top-level `size` is for shorthand values such as `"auto"`, preset strings, and `"1024x1024"`
- Use `modelOptions.size` when you need structured Mynth size objects

## Available Models

The adapter exports both a runtime list and a type union for supported image models:

```ts
import {
  MYNTH_IMAGE_MODELS,
  type MynthImageModel,
} from "@mynthio/tanstack-ai-adapter";

const defaultModel: MynthImageModel = "auto";

for (const model of MYNTH_IMAGE_MODELS) {
  console.log(model);
}
```

This is useful for model selectors, validation, and keeping client and server code in sync.

Mynth currently supports model IDs across multiple providers, including `auto`, Flux, Recraft, Gemini, Qwen, Seedream, Wan, and Grok Imagine models. Use `MYNTH_IMAGE_MODELS` for the current runtime list.

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

Returns a `MynthImageAdapter` for use with `generateImage()`.

### `createMynthImage(config?)`

Creates a reusable provider factory that returns model-bound adapters.

### `MYNTH_IMAGE_MODELS`

Readonly array of supported Mynth image model IDs.

### `MynthImageModel`

Type union of supported Mynth image model IDs.

## Limitations

- This package only provides an image adapter for `generateImage()`
- It does not provide chat or text-generation adapters

## Next Steps

- [Mynth SDK README](https://github.com/mynthio/oss/tree/main/packages/sdk)
- [TanStack Start + Mynth adapter demo](https://github.com/mynthio/oss/tree/main/examples/tanstack-start-ai-mynth-adapter)
- [Mynth](https://mynth.io)
