---
title: Decart
id: decart-adapter
order: 2
description: "Generate images and videos with Decart models in TanStack AI."
keywords:
  - tanstack ai
  - decart
  - image generation
  - video generation
  - community adapter
---

# Decart

If you need Decart image/video generation → install the adapter and call `generateImage` / `generateVideo`.

## Install

```bash
npm install @decartai/tanstack-ai-adapter
```

```bash
DECART_API_KEY=your-api-key-here
```

Key: [platform.decart.ai](https://platform.decart.ai).

## Image

```typescript
import { generateImage } from "@tanstack/ai";
import { decartImage } from "@decartai/tanstack-ai-adapter";

const result = await generateImage({
  adapter: decartImage("lucy-pro-t2i"),
  prompt: "A serene mountain landscape at sunset",
  modelOptions: {
    resolution: "720p",
    orientation: "portrait",
    seed: 42,
  },
});

console.log(result.images[0]?.b64Json);
```

Explicit key:

```typescript
import { generateImage } from "@tanstack/ai";
import { createDecartImage } from "@decartai/tanstack-ai-adapter";

const adapter = createDecartImage("lucy-pro-t2i", process.env.DECART_API_KEY!, {
  baseUrl: "https://api.decart.ai", // optional
});

const result = await generateImage({
  adapter,
  prompt: "A futuristic cityscape at night",
});
```

| Option | Type | Default |
|--------|------|---------|
| `resolution` | `"720p"` | `"720p"` |
| `orientation` | `"portrait" \| "landscape"` | `"landscape"` |
| `seed` | `number` | — |

## Video (job + poll)

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { decartVideo } from "@decartai/tanstack-ai-adapter";

async function createVideo(prompt: string) {
  const adapter = decartVideo("lucy-pro-t2v");
  const { jobId } = await generateVideo({
    adapter,
    prompt,
    modelOptions: {
      resolution: "720p",
      orientation: "landscape",
      seed: 42,
    },
  });

  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const result = await getVideoJobStatus({ adapter, jobId });
    if (result.status === "failed") throw new Error("Video generation failed");
    if (result.status === "completed" && result.url) return result.url;
  }
}

const videoUrl = await createVideo("A drone shot over a tropical beach");
```

| Option | Type | Default |
|--------|------|---------|
| `resolution` | `"720p" \| "480p"` | `"720p"` |
| `orientation` | `"portrait" \| "landscape"` | `"landscape"` |
| `seed` | `number` | — |

## API

- `decartImage(model, config?)` / `createDecartImage(model, apiKey, config?)` — model `"lucy-pro-t2i"`
- `decartVideo(model, config?)` / `createDecartVideo(model, apiKey, config?)` — model `"lucy-pro-t2v"`
- `config.baseUrl?` optional

## Links

- [Platform](https://platform.decart.ai) · [API docs](https://docs.platform.decart.ai) · [GitHub](https://github.com/decartai/tanstack-ai)
- [Image generation](../media/image-generation) · [Video generation](../media/video-generation)
