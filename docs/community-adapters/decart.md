---
title: Decart
id: decart-adapter
order: 2
---

The Decart adapter provides access to Decart's image and video generation models.

## Installation

```bash
npm install @decartai/tanstack-ai-adapter
```

## Basic Usage

```typescript
import { generateImage } from "@tanstack/ai";
import { decartImage } from "@decartai/tanstack-ai-adapter";

const result = await generateImage({
  adapter: decartImage("lucy-pro-t2i"),
  prompt: "A serene mountain landscape at sunset",
});
```

## Basic Usage - Custom API Key

```typescript
import { generateImage } from "@tanstack/ai";
import { createDecartImage } from "@decartai/tanstack-ai-adapter";

const adapter = createDecartImage("lucy-pro-t2i", process.env.DECART_API_KEY!);

const result = await generateImage({
  adapter,
  prompt: "A serene mountain landscape at sunset",
});
```

## Configuration

```typescript
import { createDecartImage, type DecartImageConfig } from "@decartai/tanstack-ai-adapter";

const config: Omit<DecartImageConfig, "apiKey"> = {
  baseUrl: "https://api.decart.ai", // Optional, for custom endpoints
};

const adapter = createDecartImage("lucy-pro-t2i", process.env.DECART_API_KEY!, config);
```

## Image Generation

Generate images with `lucy-pro-t2i`:

```typescript
import { generateImage } from "@tanstack/ai";
import { decartImage } from "@decartai/tanstack-ai-adapter";

const result = await generateImage({
  adapter: decartImage("lucy-pro-t2i"),
  prompt: "A futuristic cityscape at night",
});

console.log(result.images[0].b64Json);
```

### Image Model Options

```typescript
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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resolution` | `"720p"` | `"720p"` | Output resolution |
| `orientation` | `"portrait" \| "landscape"` | `"landscape"` | Image orientation |
| `seed` | `number` | - | Seed for reproducible generation |

## Video Generation

Video generation uses an async job/polling architecture.

### Creating a Video Job

```typescript
import { generateVideo } from "@tanstack/ai";
import { decartVideo } from "@decartai/tanstack-ai-adapter";

const { jobId } = await generateVideo({
  adapter: decartVideo("lucy-pro-t2v"),
  prompt: "A cat playing with a ball of yarn",
});

console.log("Job started:", jobId);
```

### Polling for Status

```typescript
import { getVideoJobStatus } from "@tanstack/ai";
import { decartVideo } from "@decartai/tanstack-ai-adapter";

const status = await getVideoJobStatus({
  adapter: decartVideo("lucy-pro-t2v"),
  jobId,
});

console.log("Status:", status.status); // "pending" | "processing" | "completed" | "failed"

if (status.status === "completed" && status.url) {
  console.log("Video URL:", status.url);
}
```

### Complete Example with Polling

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

### Video Model Options

```typescript
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

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `resolution` | `"720p" \| "480p"` | `"720p"` | Output resolution |
| `orientation` | `"portrait" \| "landscape"` | `"landscape"` | Video orientation |
| `seed` | `number` | - | Seed for reproducible generation |

## Environment Variables

Set your API key in environment variables:

```bash
DECART_API_KEY=your-api-key-here
```

## Getting an API Key

1. Go to [Decart Platform](https://platform.decart.ai)
2. Create an account and generate an API key
3. Add it to your environment variables

## API Reference

### `decartImage(model, config?)`

Creates a Decart image adapter using environment variables.

**Parameters:**

- `model` - Model name (`"lucy-pro-t2i"`)
- `config.baseUrl?` - Custom base URL (optional)

**Returns:** A Decart image adapter instance.

### `createDecartImage(model, apiKey, config?)`

Creates a Decart image adapter with an explicit API key.

**Parameters:**

- `model` - Model name (`"lucy-pro-t2i"`)
- `apiKey` - Your Decart API key
- `config.baseUrl?` - Custom base URL (optional)

**Returns:** A Decart image adapter instance.

### `decartVideo(model, config?)`

Creates a Decart video adapter using environment variables.

**Parameters:**

- `model` - Model name (`"lucy-pro-t2v"`)
- `config.baseUrl?` - Custom base URL (optional)

**Returns:** A Decart video adapter instance.

### `createDecartVideo(model, apiKey, config?)`

Creates a Decart video adapter with an explicit API key.

**Parameters:**

- `model` - Model name (`"lucy-pro-t2v"`)
- `apiKey` - Your Decart API key
- `config.baseUrl?` - Custom base URL (optional)

**Returns:** A Decart video adapter instance.

## Next Steps

- [Decart Platform](https://platform.decart.ai) - Visit Decart's platform to generate API keys
- [API Documentation](https://docs.platform.decart.ai) - View complete API reference
- [GitHub Repository](https://github.com/decartai/tanstack-ai) - Explore the adapter source code
- [Image Generation Guide](../guides/image-generation) - Learn about image generation
- [Video Generation Guide](../guides/video-generation) - Learn about video generation
