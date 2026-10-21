---
title: Decart
id: decart-adapter
order: 2
description: "Generate images and videos with Decart's Lucy models in TanStack AI through the Decart community adapter."
keywords:
  - tanstack ai
  - decart
  - image generation
  - video generation
  - community adapter
---

The Decart adapter gives you Decart's image and video models in `generateImage()` and `generateVideo()`. Decart maintains this adapter.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @decartai/tanstack-ai-adapter
vue: @decartai/tanstack-ai-adapter
solid: @decartai/tanstack-ai-adapter
svelte: @decartai/tanstack-ai-adapter
preact: @decartai/tanstack-ai-adapter
angular: @decartai/tanstack-ai-adapter
vanilla: @decartai/tanstack-ai-adapter
octane: @decartai/tanstack-ai-adapter

<!-- ::end:tabs -->

## 2. Set the API key

1. Go to the [Decart Platform](https://platform.decart.ai).
2. Create an account and make an API key.
3. Put the key in the environment of your server:

```bash
DECART_API_KEY=your-api-key-here
```

`decartImage` and `decartVideo` read `DECART_API_KEY`. To pass the key in code, use `createDecartImage` or `createDecartVideo`:

```typescript
import { generateImage } from "@tanstack/ai";
import { createDecartImage } from "@decartai/tanstack-ai-adapter";

const adapter = createDecartImage("lucy-pro-t2i", process.env.DECART_API_KEY!);

const result = await generateImage({
  adapter,
  prompt: "A serene mountain landscape at sunset",
});
```

## 3. Generate an image

```typescript
import { generateImage } from "@tanstack/ai";
import { decartImage } from "@decartai/tanstack-ai-adapter";

const result = await generateImage({
  adapter: decartImage("lucy-pro-t2i"),
  prompt: "A futuristic cityscape at night",
});

console.log(result.images[0]?.b64Json);
```

You get the image as base64 data in `result.images[0]?.b64Json`. See [Image Generation](../media/image-generation).

## Video

Video generation runs as a job. You start the job, then you ask for its status until it is done.

1. Start the job:

```typescript
import { generateVideo } from "@tanstack/ai";
import { decartVideo } from "@decartai/tanstack-ai-adapter";

const { jobId } = await generateVideo({
  adapter: decartVideo("lucy-pro-t2v"),
  prompt: "A cat playing with a ball of yarn",
});

console.log("Job started:", jobId);
```

2. Ask for the status:

```typescript
import { getVideoJobStatus } from "@tanstack/ai";
import { decartVideo } from "@decartai/tanstack-ai-adapter";

const jobId = "example-job-id";
const status = await getVideoJobStatus({
  adapter: decartVideo("lucy-pro-t2v"),
  jobId,
});

console.log("Status:", status.status); // "pending" | "processing" | "completed" | "failed"

if (status.status === "completed" && status.url) {
  console.log("Video URL:", status.url);
}
```

The two steps together, with a status check every 5 seconds:

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { decartVideo } from "@decartai/tanstack-ai-adapter";

async function createVideo(prompt: string) {
  const adapter = decartVideo("lucy-pro-t2v");

  // Create the job
  const { jobId } = await generateVideo({ adapter, prompt });
  console.log("Job created:", jobId);

  // Poll for completion
  let status = "pending";
  while (status !== "completed" && status !== "failed") {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const result = await getVideoJobStatus({ adapter, jobId });
    status = result.status;
    console.log(`Status: ${status}`);

    if (result.status === "failed") {
      throw new Error("Video generation failed");
    }

    if (result.status === "completed" && result.url) {
      return result.url;
    }
  }
}

const videoUrl = await createVideo("A drone shot over a tropical beach");
```

See [Video Generation](../media/video-generation).

## Models and options

### Models

| Model | Kind | Factory |
| --- | --- | --- |
| `lucy-pro-t2i` | Image | `decartImage`, `createDecartImage` |
| `lucy-pro-t2v` | Video | `decartVideo`, `createDecartVideo` |

### Image options

Pass these in `modelOptions`:

```typescript
import { generateImage } from "@tanstack/ai";
import { decartImage } from "@decartai/tanstack-ai-adapter";

const result = await generateImage({
  adapter: decartImage("lucy-pro-t2i"),
  prompt: "A portrait of a robot artist",
  modelOptions: {
    resolution: "720p",
    orientation: "portrait",
    seed: 42,
  },
});
```

| Option | Type | Default | What it does |
|--------|------|---------|-------------|
| `resolution` | `"720p"` | `"720p"` | The output resolution. |
| `orientation` | `"portrait" \| "landscape"` | `"landscape"` | The image orientation. |
| `seed` | `number` | none | A seed, to get the same image again. |

### Video options

```typescript
import { generateVideo } from "@tanstack/ai";
import { decartVideo } from "@decartai/tanstack-ai-adapter";

const { jobId } = await generateVideo({
  adapter: decartVideo("lucy-pro-t2v"),
  prompt: "A timelapse of a blooming flower",
  modelOptions: {
    resolution: "720p",
    orientation: "landscape",
    seed: 42,
  },
});
```

| Option | Type | Default | What it does |
|--------|------|---------|-------------|
| `resolution` | `"720p" \| "480p"` | `"720p"` | The output resolution. |
| `orientation` | `"portrait" \| "landscape"` | `"landscape"` | The video orientation. |
| `seed` | `number` | none | A seed, to get the same video again. |

### Factories

| Factory | What it does |
| --- | --- |
| `decartImage(model, config?)` | An image adapter that reads `DECART_API_KEY`. |
| `createDecartImage(model, apiKey, config?)` | An image adapter with an explicit API key. |
| `decartVideo(model, config?)` | A video adapter that reads `DECART_API_KEY`. |
| `createDecartVideo(model, apiKey, config?)` | A video adapter with an explicit API key. |

Each factory takes an optional `config.baseUrl`, for a custom endpoint:

```typescript
import { createDecartImage, type DecartImageConfig } from "@decartai/tanstack-ai-adapter";

const config: Omit<DecartImageConfig, "apiKey"> = {
  baseUrl: "https://api.decart.ai", // Optional, for custom endpoints
};

const adapter = createDecartImage("lucy-pro-t2i", process.env.DECART_API_KEY!, config);
```

For the full API, see the [Decart API docs](https://docs.platform.decart.ai). The adapter source is on [GitHub](https://github.com/decartai/tanstack-ai).
