---
title: Mynth
id: mynth-adapter
description: "Image generation with Mynth (Flux, Recraft, Gemini, Qwen, Seedream, Wan, Grok Imagine) in TanStack AI."
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

If you need Mynth image models via `generateImage()` → install `@mynthio/tanstack-ai-adapter` (image-only; `@tanstack/ai` ≥ 0.34). Public beta — model list may change.

## Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @mynthio/tanstack-ai-adapter @tanstack/ai
vue: @mynthio/tanstack-ai-adapter @tanstack/ai
solid: @mynthio/tanstack-ai-adapter @tanstack/ai
svelte: @mynthio/tanstack-ai-adapter @tanstack/ai
preact: @mynthio/tanstack-ai-adapter @tanstack/ai
angular: @mynthio/tanstack-ai-adapter @tanstack/ai
octane: @mynthio/tanstack-ai-adapter @tanstack/ai
vanilla: @mynthio/tanstack-ai-adapter @tanstack/ai

<!-- ::end:tabs -->

```sh
MYNTH_API_KEY=mak_...
```

Server-only. Key: [Mynth dashboard](https://mynth.io/dashboard/keys). Optional `apiKey` / `baseUrl` on adapter config.

## Quick start

```ts
import { generateImage } from "@tanstack/ai";
import { mynthImage } from "@mynthio/tanstack-ai-adapter";

const result = await generateImage({
  adapter: mynthImage("black-forest-labs/flux.2-dev"),
  prompt: "Editorial product photo of a ceramic mug on a linen tablecloth",
  numberOfImages: 1,
  size: "square",
});

console.log(result.images[0]?.url);
```

## Reusable provider

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
```

Per-adapter override: `mynth("auto", { baseUrl: "https://proxy.example.com" })`.

## Model options

Top-level: `prompt`, `numberOfImages`, shorthand `size`. Mynth-specific via `modelOptions`:

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
    output: { format: "png", quality: 90 },
    rating: true,
    metadata: { requestId: "req_123" },
  },
});
```

- `negativePrompt` / `magicPrompt` → Mynth `negative_prompt` / `magic_prompt`
- `modelOptions.size` overrides top-level `size` (structured ratios / `scale: "4k"`)
- `promptStructured` still expands to prompt fields; `positive` overrides plain `prompt`
- `destination` delivers to a configured Mynth destination

## Image-to-image

Models in `MYNTH_IMAGE_INPUT_MODELS` accept content-part prompts:

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

URL or data sources supported. Finer intents: `modelOptions.inputs` with explicit `as`. Prompt parts + `modelOptions.inputs` combine (prompt first). Image parts on text-only models are a compile-time error.

## Models list + live catalog

```ts
import { MYNTH_IMAGE_MODELS, type MynthImageModel } from "@mynthio/tanstack-ai-adapter";

const defaultModel: MynthImageModel = "auto";
for (const model of MYNTH_IMAGE_MODELS) console.log(model);
```

Live pricing: `GET https://api.mynth.io/models` (no key) or SDK `new Mynth().models.list()`.

## Streaming endpoint

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

Demo: [TanStack Start + Mynth](https://github.com/mynthio/oss/tree/main/examples/tanstack-start-ai-mynth-adapter).

## Result shape

- `id` — Mynth task id
- `model` — resolved model (or requested fallback)
- `images` — successful images only; `revisedPrompt` when enhanced

## API

- `mynthImage(model, config?)` — `apiKey?`, `baseUrl?`, `destination?`
- `createMynthImage(config?)` — factory for model-bound adapters
- `MYNTH_IMAGE_MODELS` / `MynthImageModel`
- `MYNTH_IMAGE_INPUT_MODELS` / `MynthImageInputModel`

Image-only package — no chat/text adapter.

## Links

- [Mynth SDK](https://github.com/mynthio/oss/tree/main/packages/sdk) · [mynth.io](https://mynth.io)
