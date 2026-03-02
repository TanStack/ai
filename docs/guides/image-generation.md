---
title: Image Generation
id: image-generation
order: 15
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
