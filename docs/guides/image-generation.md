---
title: Image Generation
id: image-generation
order: 16
---

# Image Generation

TanStack AI provides support for image generation through dedicated image adapters. This guide covers how to use the image generation functionality with OpenAI and Gemini providers.

## Overview

Image generation is handled by image adapters that follow the same tree-shakeable architecture as other adapters in TanStack AI. The image adapters support:

- **OpenAI**: DALL-E 2, DALL-E 3, GPT-Image-1, and GPT-Image-1-Mini models
- **Gemini**: Gemini native image models (NanoBanana) and Imagen 3/4 models
- **fal.ai**: 600+ models including Nano Banana Pro, FLUX, and more

## Basic Usage

### OpenAI Image Generation

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

// Create an image adapter (uses OPENAI_API_KEY from environment)
const adapter = openaiImage()

// Generate an image
const result = await generateImage({
  adapter: openaiImage('dall-e-3'),
  prompt: 'A beautiful sunset over mountains',
})

console.log(result.images[0].url) // URL to the generated image
```

### Gemini Image Generation

Gemini supports two types of image generation: Gemini native models (NanoBanana) and Imagen models. The adapter automatically routes to the correct API based on the model name.

```typescript
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'

// Gemini native model (NanoBanana) — uses generateContent API
const result = await generateImage({
  adapter: geminiImage('gemini-3.1-flash-image-preview'),
  prompt: 'A futuristic cityscape at night',
  size: '16:9_4K',
})

// Imagen model — uses generateImages API
const result2 = await generateImage({
  adapter: geminiImage('imagen-4.0-generate-001'),
  prompt: 'A futuristic cityscape at night',
})

console.log(result.images[0].b64Json) // Base64 encoded image
```

## Options

### Common Options

All image adapters support these common options:

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `ImageAdapter` | Image adapter instance with model (required) |
| `prompt` | `string` | Text description of the image to generate (required) |
| `numberOfImages` | `number` | Number of images to generate |
| `size` | `string` | Size of the generated image in WIDTHxHEIGHT format |
| `modelOptions?` | `object` | Model-specific options (renamed from `providerOptions`) |

### Size Options

#### OpenAI Models

| Model | Supported Sizes |
|-------|----------------|
| `gpt-image-1` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` |
| `gpt-image-1-mini` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` |
| `dall-e-3` | `1024x1024`, `1792x1024`, `1024x1792` |
| `dall-e-2` | `256x256`, `512x512`, `1024x1024` |

#### Gemini Native Models (NanoBanana)

Gemini native image models use a template literal size format: `"aspectRatio_resolution"`.

| Aspect Ratios | Resolutions |
|---------------|-------------|
| `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `9:16`, `16:9`, `21:9` | `1K`, `2K`, `4K` |

```typescript
// Examples
size: "16:9_4K"   // Widescreen at 4K resolution
size: "1:1_2K"    // Square at 2K resolution
size: "9:16_1K"   // Portrait at 1K resolution
```

#### Gemini Imagen Models

Imagen models accept WIDTHxHEIGHT format, which maps to aspect ratios internally:

| Size | Aspect Ratio |
|------|-------------|
| `1024x1024` | 1:1 |
| `1920x1080` | 16:9 |
| `1080x1920` | 9:16 |

Alternatively, you can specify the aspect ratio directly in Model Options:

```typescript
const result = await generateImage({
  adapter: geminiImage('imagen-4.0-generate-001'),
  prompt: 'A landscape photo',
  modelOptions: {
    aspectRatio: '16:9'
  }
})
```

## Model Options

### OpenAI Model Options

OpenAI models support model-specific Model Options:

#### GPT-Image-1 / GPT-Image-1-Mini

```typescript
const result = await generateImage({
  adapter: openaiImage('gpt-image-1'),
  prompt: 'A cat wearing a hat',
  modelOptions: {
    quality: 'high', // 'high' | 'medium' | 'low' | 'auto'
    background: 'transparent', // 'transparent' | 'opaque' | 'auto'
    outputFormat: 'png', // 'png' | 'jpeg' | 'webp'
    moderation: 'low', // 'low' | 'auto'
  }
})
```

#### DALL-E 3

```typescript
const result = await generateImage({
  adapter: openaiImage('dall-e-3'),
  prompt: 'A futuristic car',
  modelOptions: {
    quality: 'hd', // 'hd' | 'standard'
    style: 'vivid', // 'vivid' | 'natural'
  }
})
```

### Gemini Imagen Model Options

```typescript
const result = await generateImage({
  adapter: geminiImage('imagen-4.0-generate-001'),
  prompt: 'A beautiful garden',
  modelOptions: {
    aspectRatio: '16:9',
    personGeneration: 'ALLOW_ADULT', // 'DONT_ALLOW' | 'ALLOW_ADULT' | 'ALLOW_ALL'
    negativePrompt: 'blurry, low quality',
    addWatermark: true,
    outputMimeType: 'image/png', // 'image/png' | 'image/jpeg' | 'image/webp'
  }
})
```

### Gemini Native Model Options (NanoBanana)

Gemini native image models accept `GenerateContentConfig` options directly in `modelOptions`:

```typescript
const result = await generateImage({
  adapter: geminiImage('gemini-3.1-flash-image-preview'),
  prompt: 'A beautiful garden',
  size: '16:9_4K',
})
```

## Response Format

The image generation result includes:

```typescript
interface ImageGenerationResult {
  id: string // Unique identifier for this generation
  model: string // The model used
  images: GeneratedImage[] // Array of generated images
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

interface GeneratedImage {
  b64Json?: string // Base64 encoded image data
  url?: string // URL to the image (OpenAI only)
  revisedPrompt?: string // Revised prompt (OpenAI only)
}
```

## Model Availability

### OpenAI Models

| Model | Images per Request |
|-------|-------------------|
| `gpt-image-1` | 1-10 |
| `gpt-image-1-mini` | 1-10 |
| `dall-e-3` | 1 |
| `dall-e-2` | 1-10 |

### Gemini Native Models (NanoBanana)

| Model | Description |
|-------|-------------|
| `gemini-3.1-flash-image-preview` | Latest and fastest Gemini native image generation |
| `gemini-3-pro-image-preview` | Higher quality Gemini native image generation |
| `gemini-2.5-flash-image` | Gemini 2.5 Flash with image generation |
| `gemini-2.0-flash-preview-image-generation` | Gemini 2.0 Flash image generation |

### Gemini Imagen Models

| Model | Images per Request |
|-------|-------------------|
| `imagen-4.0-ultra-generate-001` | 1-4 |
| `imagen-4.0-generate-001` | 1-4 |
| `imagen-4.0-fast-generate-001` | 1-4 |
| `imagen-3.0-generate-002` | 1-4 |

## Error Handling

Image generation can fail for various reasons. The adapters validate inputs before making API calls:

```typescript
try {
  const result = await generateImage({
    adapter: openaiImage('dall-e-3'),
    prompt: 'A cat',
    size: '512x512', // Invalid size for DALL-E 3
  })
} catch (error) {
  console.error(error.message)
  // "Size "512x512" is not supported by model "dall-e-3". 
  //  Supported sizes: 1024x1024, 1792x1024, 1024x1792"
}
```

## Full-Stack Usage

TanStack AI provides React hooks and server-side streaming helpers to build full-stack image generation with minimal boilerplate.

### Streaming Mode (Server Route + Client Hook)

**Server** — Create an API route that wraps `generateImage` as a streaming response:

```typescript
// routes/api/generate/image.ts
import { generateImage, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/generate/image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { prompt, size, model, numberOfImages } = body.data

        const stream = generateImage({
          adapter: openaiImage(model ?? 'dall-e-3'),
          prompt,
          size,
          numberOfImages,
          stream: true,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

**Client** — Use the `useGenerateImage` hook with a connection adapter:

```tsx
import { useGenerateImage, fetchServerSentEvents } from '@tanstack/ai-react'

function ImageGenerator() {
  const { generate, result, isLoading, error, reset } = useGenerateImage({
    connection: fetchServerSentEvents('/api/generate/image'),
  })

  return (
    <div>
      <button
        onClick={() => generate({ prompt: 'A sunset over mountains' })}
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate'}
      </button>
      {error && <p>Error: {error.message}</p>}
      {result?.images.map((img, i) => (
        <img
          key={i}
          src={img.url || `data:image/png;base64,${img.b64Json}`}
          alt={img.revisedPrompt || 'Generated image'}
        />
      ))}
      {result && <button onClick={reset}>Clear</button>}
    </div>
  )
}
```

### Direct Mode (Server Function + Fetcher)

For non-streaming usage with TanStack Start server functions:

```typescript
// lib/server-functions.ts
import { createServerFn } from '@tanstack/react-start'
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

export const generateImageFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: string; model?: string }) => data)
  .handler(async ({ data }) => {
    return generateImage({
      adapter: openaiImage(data.model ?? 'dall-e-3'),
      prompt: data.prompt,
    })
  })
```

```tsx
// components/ImageGenerator.tsx
import { useGenerateImage } from '@tanstack/ai-react'
import { generateImageFn } from '../lib/server-functions'

function ImageGenerator() {
  const { generate, result, isLoading } = useGenerateImage({
    fetcher: (data) => generateImageFn({ data }),
  })

  return (
    <div>
      <button
        onClick={() => generate({ prompt: 'A sunset over mountains' })}
        disabled={isLoading}
      >
        Generate
      </button>
      {result?.images.map((img, i) => (
        <img key={i} src={img.url || `data:image/png;base64,${img.b64Json}`} />
      ))}
    </div>
  )
}
```

### Server Function Streaming (Fetcher + Response)

For TanStack Start server functions that stream results. The fetcher receives type-safe input and returns an SSE `Response` — the client parses it automatically:

```typescript
// lib/server-functions.ts
import { createServerFn } from '@tanstack/react-start'
import { generateImage, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

export const generateImageStreamFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { prompt: string; model?: string }) => data)
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateImage({
        adapter: openaiImage(data.model ?? 'dall-e-3'),
        prompt: data.prompt,
        stream: true,
      }),
    )
  })
```

```tsx
import { useGenerateImage } from '@tanstack/ai-react'
import { generateImageStreamFn } from '../lib/server-functions'

function ImageGenerator() {
  const { generate, result, isLoading } = useGenerateImage({
    fetcher: (input) => generateImageStreamFn({ data: input }),
  })

  return (
    <div>
      <button
        onClick={() => generate({ prompt: 'A sunset over mountains' })}
        disabled={isLoading}
      >
        Generate
      </button>
      {result?.images.map((img, i) => (
        <img key={i} src={img.url || `data:image/png;base64,${img.b64Json}`} />
      ))}
    </div>
  )
}
```

### Hook API

The `useGenerateImage` hook accepts:

| Option | Type | Description |
|--------|------|-------------|
| `connection` | `ConnectionAdapter` | Streaming transport (SSE, HTTP stream, custom) |
| `fetcher` | `(input) => Promise<ImageGenerationResult \| Response>` | Direct async function, or server function returning an SSE `Response` |
| `id` | `string` | Unique identifier for this instance |
| `body` | `Record<string, any>` | Additional body parameters (connection mode) |
| `onResult` | `(result) => void` | Callback when images are generated |
| `onError` | `(error) => void` | Callback on error |
| `onProgress` | `(progress, message?) => void` | Progress updates (0-100) |

And returns:

| Property | Type | Description |
|----------|------|-------------|
| `generate` | `(input: ImageGenerateInput) => Promise<void>` | Trigger generation |
| `result` | `ImageGenerationResult \| null` | The result, or null |
| `isLoading` | `boolean` | Whether generation is in progress |
| `error` | `Error \| undefined` | Current error, if any |
| `status` | `GenerationClientState` | `'idle'` \| `'generating'` \| `'success'` \| `'error'` |
| `stop` | `() => void` | Abort the current generation |
| `reset` | `() => void` | Clear result, error, and return to idle |

## Environment Variables

The image adapters use the same environment variables as the text adapters:

- **OpenAI**: `OPENAI_API_KEY`
- **Gemini** (including NanoBanana): `GOOGLE_API_KEY` or `GEMINI_API_KEY`

## Explicit API Keys

For production use or when you need explicit control:

```typescript
import { createOpenaiImage } from '@tanstack/ai-openai'
import { createGeminiImage } from '@tanstack/ai-gemini'

// OpenAI
const openaiAdapter = createOpenaiImage('your-openai-api-key')

// Gemini
const geminiAdapter = createGeminiImage('your-google-api-key')
```
