---
title: fal.ai
id: fal-adapter
---

The fal.ai adapter provides access to 600+ models on the fal.ai platform for image generation and video generation. Unlike text-focused adapters, the fal adapter is **media-focused** — it supports `generateImage()` and `generateVideo()` but does not support `chat()` or tools. Audio and speech support are coming soon.

For a full working example, see the [fal.ai example app](https://github.com/TanStack/ai/tree/main/examples/ts-react-media).

## Installation

```bash
npm install @tanstack/ai-fal
```

## Type Safety with String Literals

The fal adapter provides full type safety when you pass the model ID as a **string literal**. This gives you autocomplete for `size` and `modelOptions` specific to that model. Always use string literals — not variables — when creating adapters:

```typescript
// Good — full type safety and autocomplete
const adapter = falImage("fal-ai/z-image/turbo");

// Bad — no type inference for model-specific options
const modelId = "fal-ai/z-image/turbo";
const adapter = falImage(modelId);
```

You can also pass any string for new models that fal.ai hasn't provided types for yet — you just won't get type safety on those endpoints.

## Basic Usage

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

const result = await generateImage({
  adapter: falImage("fal-ai/flux/dev"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
});

console.log(result.images);
```

## Basic Usage - Custom API Key

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

const adapter = falImage("fal-ai/flux/dev", {
  apiKey: process.env.FAL_KEY!,
});

const result = await generateImage({
  adapter,
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
});
```

## Configuration

```typescript
import { falImage, type FalClientConfig } from "@tanstack/ai-fal";

// Direct API key
const adapter = falImage("fal-ai/flux/dev", {
  apiKey: "your-api-key",
});

// Using a proxy URL (for client-side usage)
const proxiedAdapter = falImage("fal-ai/flux/dev", {
  apiKey: "your-api-key",
  proxyUrl: "https://your-server.com/api/fal/proxy",
});
```

## Example: Image Generation

From the [fal.ai example app](https://github.com/TanStack/ai/tree/main/examples/ts-react-media):

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

// Use string literals for the model to get full type safety
const result = await generateImage({
  adapter: falImage("fal-ai/nano-banana-pro"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
  size: "16:9_4K",
  modelOptions: {
    output_format: "jpeg",
  },
});
```

## Example: Image with Model Options

Each fal.ai model has its own type-safe options. The adapter uses fal.ai's types to provide autocomplete and type checking for model-specific parameters. There are 1000s of combinations. If you provide the proper model endpoint id as as string literal, you will then only be able to provide `size` and `modelOptions` that the model supports.

_IMPORTANT_: It is possible to pass strings and new endpoint ids that Fal has not provided types for. You just won't get type safety on those endpoints. You'll find this happens for very new models.

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

// Model-specific options are type-safe
const result = await generateImage({
  adapter: falImage("fal-ai/z-image/turbo"),
  prompt: "A serene mountain landscape",
  numberOfImages: 1,
  size: "landscape_16_9",
  modelOptions: {
    acceleration: "high",
    enable_prompt_expansion: true,
  },
});
```

## Image Size Options

The fal adapter supports a flexible `size` paramater that maps either to `image_size` or to `aspect_ratio` and `resolution` parameters:

|  | `size` | Maps To |
|--------|---------|---------|
| named | `"landscape_16_9"` | `image_size: "landscape_16_9"` |
| width x height (OpenAI) | `"1536x1024"` | | `image_size: "1536x1024"` |
| aspect ratio & resolution | `"16:9_4K"` | `aspect_ratio: "16:9"`, `resolution: "4K"` |
| aspect ratio only | `"16:9"` | `aspect_ratio: "16:9"` |

```typescript
// Aspect ratio only
size: "16:9"

// Aspect ratio with resolution
size: "16:9_4K"

// Named size (model-specific)
size: "landscape_16_9"
```

## Video Generation (Experimental)

> **Note:** Video generation is an experimental feature and may change in future releases. In particular, this version of the adapter does not map the duration paramater

Video generation uses a queue-based workflow: submit a job, poll for status, then retrieve the video URL when complete.

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { falVideo } from "@tanstack/ai-fal";
```

## Example: Text-to-Video

From the [fal.ai example app](https://github.com/TanStack/ai/tree/main/examples/ts-react-media):

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { falVideo } from "@tanstack/ai-fal";

// 1. Submit the video generation job
const adapter = falVideo("fal-ai/kling-video/v2.6/pro/text-to-video");

const job = await generateVideo({
  adapter,
  prompt: "A timelapse of a flower blooming",
  size: "16:9_1080p",
  modelOptions: {
    duration: "5",
  },
});

// 2. Poll for status
const status = await getVideoJobStatus({
  adapter,
  jobId: job.jobId,
});

console.log(status.status); // "pending" | "processing" | "completed"
```

## Example: Image-to-Video

```typescript
import { generateVideo } from "@tanstack/ai";
import { falVideo } from "@tanstack/ai-fal";

const job = await generateVideo({
  adapter: falVideo("fal-ai/kling-video/v2.6/pro/image-to-video"),
  prompt: "Animate this scene with gentle wind",
  modelOptions: {
    start_image_url: "https://example.com/image.jpg",
    generate_audio: true,
    duration: "5",
  },
});
```

## Popular Models

### Image Models

| Model | Description |
|-------|-------------|
| `fal-ai/nano-banana-pro` | Fast, high-quality image generation (4K) |
| `fal-ai/flux-2/klein/9b` | Enhanced realism, crisp text generation |
| `fal-ai/z-image/turbo` | Super fast 6B parameter model |
| `xai/grok-imagine-image` | xAI highly aesthetic images with prompt enhancement |

### Video Models

| Model | Mode | Description |
|-------|------|-------------|
| `fal-ai/kling-video/v2.6/pro/text-to-video` | Text-to-Video | High-quality text-to-video |
| `fal-ai/kling-video/v2.6/pro/image-to-video` | Image-to-Video | Animate images with Kling |
| `fal-ai/veo3.1` | Text-to-Video | Google Veo text-to-video |
| `fal-ai/veo3.1/image-to-video` | Image-to-Video | Google Veo image-to-video |
| `xai/grok-imagine-video/text-to-video` | Text-to-Video | xAI video from text |
| `xai/grok-imagine-video/image-to-video` | Image-to-Video | xAI animate images to video |
| `fal-ai/ltx-2/text-to-video/fast` | Text-to-Video | Fast text-to-video |
| `fal-ai/ltx-2/image-to-video/fast` | Image-to-Video | Fast image-to-video animation |

## Environment Variables

Create an API key at [fal.ai](https://fal.ai) and set it in your environment:

```bash
FAL_KEY=your-fal-api-key
```

## API Reference

### `falImage(model, config?)`

Creates a fal.ai image adapter using the `FAL_KEY` environment variable or an explicit config.

**Parameters:**

- `model` - The fal.ai model ID (e.g., `"fal-ai/flux/dev"`)
- `config.apiKey?` - Your fal.ai API key (falls back to `FAL_KEY` env var)
- `config.proxyUrl?` - Proxy URL for client-side usage

**Returns:** A `FalImageAdapter` instance for use with `generateImage()`.

### `createFalImage(model, config?)`

Alias for `falImage()`.

### `falVideo(model, config?)`

Creates a fal.ai video adapter using the `FAL_KEY` environment variable or an explicit config.

**Parameters:**

- `model` - The fal.ai model ID (e.g., `"fal-ai/kling-video/v2.6/pro/text-to-video"`)
- `config.apiKey?` - Your fal.ai API key (falls back to `FAL_KEY` env var)
- `config.proxyUrl?` - Proxy URL for client-side usage

**Returns:** A `FalVideoAdapter` instance for use with `generateVideo()` and `getVideoJobStatus()`.

### `createFalVideo(model, config?)`

Alias for `falVideo()`.

### `getFalApiKeyFromEnv()`

Reads the `FAL_KEY` environment variable. Throws if not set.

**Returns:** The API key string.

### `configureFalClient(config?)`

Configures the underlying `@fal-ai/client`. Called automatically by adapter constructors. Uses `proxyUrl` if provided, otherwise sets credentials from the API key.

## Limitations

- **No text/chat support** — Use OpenAI, Anthropic, Gemini, or another text adapter for `chat()`
- **No tools support** — Tool definitions are not applicable to image/video generation
- **No summarization** — Use a text adapter for `summarize()`
- **No TTS or transcription yet** — Audio and speech support are coming soon
- **Video is experimental** — The video generation API may change in future releases

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Other Adapters](./openai) - Explore other providers
