---
title: Image Generation
id: image-generation
order: 5
description: "Generate images with generateImage() — OpenAI, Gemini, BytePlus Seedream, fal.ai."
keywords:
  - tanstack ai
  - image generation
  - generateImage
  - dall-e
  - imagen
  - nano banana
  - flux
  - fal.ai
---

# Image Generation

If you need images from a prompt → `generateImage()` with an image adapter.

**Providers:** OpenAI (DALL-E, GPT-Image) · Gemini (NanoBanana, Imagen) · BytePlus Seedream · fal.ai (600+ models)

## Basic usage

### OpenAI

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const result = await generateImage({
  adapter: openaiImage('dall-e-3'),
  prompt: 'A beautiful sunset over mountains',
})

console.log(result.images[0]?.url)
```

### Gemini

Adapter routes by model name: native image models → `generateContent`; Imagen → `generateImages`.

```typescript
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'

const result = await generateImage({
  adapter: geminiImage('gemini-3.1-flash-image-preview'),
  prompt: 'A futuristic cityscape at night',
  size: '16:9_4K',
})

const result2 = await generateImage({
  adapter: geminiImage('imagen-4.0-generate-001'),
  prompt: 'A futuristic cityscape at night',
})

console.log(result.images[0]?.b64Json)
```

### BytePlus Seedream

Size is either a token (`1K`, `2K`, `4K`) **or** pixels (`2048x2048`) — never mixed.

```typescript
import { generateImage } from '@tanstack/ai'
import { byteplusImage } from '@tanstack/ai-byteplus'

const result = await generateImage({
  adapter: byteplusImage('dola-seedream-5-0-pro-260628'),
  prompt: 'A futuristic cityscape at night',
  size: '2K',
  modelOptions: { watermark: false },
})

console.log(result.images[0]?.url)
```

Seedream quirks:

1. **`watermark` defaults to `true`** — turn it off explicitly.
2. **`numberOfImages` is an upper bound** — model decides how many the prompt warrants.
3. URLs expire in 24h — use `response_format: 'b64_json'` in `modelOptions` for bytes.

See [BytePlus adapter](../adapters/byteplus#image-generation-seedream).

## Options

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `ImageAdapter` | Required |
| `prompt` | `string \| MediaPromptPart[]` | Required. String, or multimodal parts for image-conditioned models |
| `numberOfImages` | `number` | Count (model-dependent) |
| `size` | `string` | WIDTHxHEIGHT or provider template |
| `modelOptions?` | `object` | Model-specific |

### Sizes

**OpenAI**

| Model | Sizes |
|-------|-------|
| `gpt-image-2` / `gpt-image-1` / `gpt-image-1-mini` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` |
| `dall-e-3` | `1024x1024`, `1792x1024`, `1024x1792` |
| `dall-e-2` | `256x256`, `512x512`, `1024x1024` |

**Gemini native (NanoBanana):** `"aspectRatio_resolution"` — ratios `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `9:16`, `16:9`, `21:9` × `1K` / `2K` / `4K` (e.g. `"16:9_4K"`).

**Imagen:** WIDTHxHEIGHT (`1024x1024` → 1:1, `1920x1080` → 16:9) or `modelOptions.aspectRatio`:

```typescript
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'

const result = await generateImage({
  adapter: geminiImage('imagen-4.0-generate-001'),
  prompt: 'A landscape photo',
  modelOptions: { aspectRatio: '16:9' },
})
```

## Image-conditioned generation

Pass `prompt` as ordered parts (`TextPart` / `ImagePart`):

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

await generateImage({
  adapter: openaiImage('gpt-image-2'),
  prompt: [
    { type: 'text', content: 'Turn this into a cinematic product photo' },
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/product.png' },
    },
  ],
})
```

Part order matters for multimodal providers (Gemini, OpenRouter). OpenAI/fal/xAI extract images and flatten text.

Text-only models (`dall-e-3`, Imagen) reject image parts at **compile time**.

### Referencing images in prompt text

SDK never rewrites your text — use the provider's convention:

| Provider | Convention |
| -------- | ---------- |
| OpenAI (gpt-image) | Indexed prose: `"apply the style of image 2 to image 1"` |
| FLUX.2 on fal / BFL | Indexed prose: `"subject from image 1, style from image 2"` |
| Gemini native | Describe by content/role |
| fal Kling / Seedance | `@Image1`, `@Image2` (1-indexed) |
| xAI grok-imagine | Request order only |

Optional `metadata.tag` is ignored by the SDK (self-documenting only).

### Source format

```typescript ignore
// URL
{ type: 'image', source: { type: 'url', value: 'https://example.com/img.png' } }

// Inline base64 (mimeType required)
{ type: 'image', source: { type: 'data', value: base64String, mimeType: 'image/png' } }
```

Gemini native passes URL sources as `fileData.fileUri` (no local fetch). OpenAI `/images/edits` and Sora `input_reference` need real bytes — HTTP(S) URLs **throw** by default. Opt in:

```typescript ignore
import { createOpenaiImage } from '@tanstack/ai-openai/adapters'

const adapter = createOpenaiImage('gpt-image-2', apiKey, { allowUrlFetch: true })
```

Same flag on `createOpenaiVideo` / `createGeminiVideo`.

### Role hints (`metadata.role`)

| Role | Maps to |
| ---- | ------- |
| `'reference'` / `'character'` | fal `reference_image_urls`; Gemini multimodal |
| `'mask'` | OpenAI `mask`; fal `mask_url` |
| `'control'` | fal `control_image_url` |
| `'start_frame'` / `'end_frame'` | fal / Veo frame fields (used by `generateVideo`) |

#### Inpaint with mask

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { photoUrl, maskUrl } from './urls'

await generateImage({
  adapter: openaiImage('gpt-image-2'),
  prompt: [
    { type: 'text', content: 'Replace the masked region with a tree' },
    { type: 'image', source: { type: 'url', value: photoUrl } },
    {
      type: 'image',
      source: { type: 'url', value: maskUrl },
      metadata: { role: 'mask' },
    },
  ],
})
```

#### Multi-reference (Gemini)

```typescript
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'

await generateImage({
  adapter: geminiImage('gemini-3.1-flash-image-preview'),
  prompt: [
    {
      type: 'text',
      content:
        'Generate a new image of the product using the style of the second reference',
    },
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/product.png' },
    },
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/style.png' },
    },
  ],
})
```

### Provider support (image-conditioned)

| Provider | Behavior |
| -------- | -------- |
| **OpenAI** | gpt-image-* → `images.edit()` (up to 16 + mask). dall-e-2 → 1 source. dall-e-3 → throws. |
| **Gemini** | Native → multimodal contents. Imagen → throws. |
| **fal.ai** | Per-endpoint field map; roles → `mask_url` / `control_image_url` / `reference_image_urls`. |
| **Grok** | grok-imagine → edits (≤3). mask/control throw. `grok-2-image-1212` text-only. |
| **BytePlus** | Seedream references only (≤14). Non-reference roles throw. |

Unsupported adapters throw at runtime (no silent drop).

## Full-stack

Keep batches across reloads: [Generation Persistence](../persistence/generation-persistence).

### 1. Server (SSE)

```typescript ignore
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

### 2. Client

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

Other transports: [Generations](./generations#transports-in-full). Hook API: [Generation Hooks](./generation-hooks).

### Hook API (summary)

| Option | Type | Description |
|--------|------|-------------|
| `connection` / `fetcher` | transport | SSE or direct |
| `onResult` / `onError` / `onProgress` | callbacks | Transform, errors, progress |

| Return | Type |
|--------|------|
| `generate` | `(input: ImageGenerateInput) => Promise<void>` |
| `result` / `isLoading` / `error` / `status` | state |
| `stop` / `reset` | abort / clear |

## Advanced

### Other transports

#### Direct (server function)

```typescript ignore
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

#### Server function + SSE

```typescript ignore
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
  // same UI as above
}
```

### Model options

**GPT-Image-2 / 1 / 1-Mini**

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const result = await generateImage({
  adapter: openaiImage('gpt-image-2'),
  prompt: 'A cat wearing a hat',
  modelOptions: {
    quality: 'high', // 'high' | 'medium' | 'low' | 'auto'
    background: 'transparent', // 'transparent' | 'opaque' | 'auto'
    output_format: 'png', // 'png' | 'jpeg' | 'webp'
    moderation: 'low', // 'low' | 'auto'
  },
})
```

**DALL-E 3**

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const result = await generateImage({
  adapter: openaiImage('dall-e-3'),
  prompt: 'A futuristic car',
  modelOptions: {
    quality: 'hd', // 'hd' | 'standard'
    style: 'vivid', // 'vivid' | 'natural'
  },
})
```

**Imagen**

```typescript ignore
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'

const result = await generateImage({
  adapter: geminiImage('imagen-4.0-generate-001'),
  prompt: 'A beautiful garden',
  modelOptions: {
    aspectRatio: '16:9',
    personGeneration: 'ALLOW_ADULT', // 'DONT_ALLOW' | 'ALLOW_ADULT' | 'ALLOW_ALL'
    negativePrompt: 'blurry, low quality',
    addWatermark: true,
    outputMimeType: 'image/png',
  },
})
```

### Result shape

```typescript
import type { TokenUsage } from '@tanstack/ai'

interface ImageGenerationResult {
  id: string
  model: string
  images: GeneratedImage[]
  usage?: TokenUsage // fal: usage.unitsBilled from x-fal-billable-units
}

interface GeneratedImage {
  b64Json?: string
  url?: string
  revisedPrompt?: string
}
```

```typescript
import { generateImage } from '@tanstack/ai'
import { falImage } from '@tanstack/ai-fal'
import { unitPrice } from './pricing'

const result = await generateImage({
  adapter: falImage('fal-ai/flux/dev'),
  prompt: 'a serene mountain lake',
})

if (result.usage?.unitsBilled != null) {
  console.log(`Billed ${result.usage.unitsBilled} units`)
}
```

### Models

| OpenAI | Images/request |
|--------|----------------|
| `gpt-image-2` / `gpt-image-1` / `gpt-image-1-mini` | 1–10 |
| `dall-e-3` | 1 |
| `dall-e-2` | 1–10 |

| Gemini native | Notes |
|---------------|-------|
| `gemini-3.1-flash-image-preview` | Latest / fastest |
| `gemini-3.1-flash-lite-image` | Low latency / cost |
| `gemini-3-pro-image-preview` | Higher quality |
| `gemini-2.5-flash-image` | 2.5 Flash image |

| Imagen | Images/request |
|--------|----------------|
| `imagen-4.0-ultra-generate-001` / `generate-001` / `fast-generate-001` | 1–4 |

### Errors / keys

Invalid size throws before the API call. Env: `OPENAI_API_KEY`, `GOOGLE_API_KEY` / `GEMINI_API_KEY`, `ARK_API_KEY` / `BYTEPLUS_API_KEY`.

```typescript
import { createOpenaiImage } from '@tanstack/ai-openai'
import { createGeminiImage } from '@tanstack/ai-gemini'

const openaiAdapter = createOpenaiImage('dall-e-3', 'your-openai-api-key')
const geminiAdapter = createGeminiImage(
  'imagen-4.0-generate-001',
  'your-google-api-key',
)
```
