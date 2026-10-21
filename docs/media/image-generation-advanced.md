---
title: "Image Generation: Advanced"
id: image-generation-advanced
order: 5.5
description: "Reference for image generation in TanStack AI: sizes per model, model options, masks and role hints, URL inputs, provider limits, the result shape, cost tracking, and errors."
keywords:
  - tanstack ai
  - image generation
  - generateImage
  - image sizes
  - inpaint
  - image edit
  - model options
---

This page is the reference for [Image Generation](./image-generation). Start there to get your first image working.

## Other transports

The image page uses a streaming route. To call a TanStack Start server function instead, with or without streaming, see [Generations: Transports in full](./generations#transports-in-full). The image code is the same in all three.

## Sizes per model

### OpenAI

| Model | Sizes |
| --- | --- |
| `gpt-image-2.5-flare` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` |
| `gpt-image-2.5-sunburst` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` |
| `gpt-image-2` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` |
| `gpt-image-1` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` |
| `gpt-image-1-mini` | `1024x1024`, `1536x1024`, `1024x1536`, `auto` |
| `dall-e-3` | `1024x1024`, `1792x1024`, `1024x1792` |
| `dall-e-2` | `256x256`, `512x512`, `1024x1024` |

### Gemini native models (Nano Banana)

The size is `"<aspectRatio>_<resolution>"`. TypeScript narrows the accepted sizes for each model.

| Model | Aspect ratios | Resolutions |
| --- | --- | --- |
| `gemini-nano-banana-2.1` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`, `1:4`, `4:1`, `1:8`, `8:1` | `1K`, `2K`, `4K` |
| `gemini-3.1-flash-image` | the same 14 ratios | `512`, `1K`, `2K`, `4K` |
| `gemini-3.1-flash-lite-image` | the same 14 ratios (see the note below) | `1K` |
| `gemini-3-pro-image` | `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9` | `1K`, `2K`, `4K` |

```typescript ignore
size: '16:9_4K' // widescreen at 4K
size: '1:1_2K' // square at 2K
size: '1:8_512' // tall banner at the 512 tier, gemini-3.1-flash-image only
```

Rules for the size string:

- The `K` is case-sensitive. The API rejects `1k`.
- The token for the smallest tier is `512`. It is not `512px` or `0.5K`.
- `9:21` works only on Vertex and Cloud, so the type does not accept it.

> [!NOTE]
> For `gemini-3.1-flash-lite-image`, Google lists the four banner ratios (`1:4`, `4:1`, `1:8`, `8:1`) on the Cloud model page, but not in the Gemini API guide. If the API rejects them, use the 10 standard ratios on this model.

### Gemini Imagen models

Imagen takes `WIDTHxHEIGHT`. The adapter maps it to an aspect ratio:

| Size | Aspect ratio |
| --- | --- |
| `1024x1024` | 1:1 |
| `1920x1080` | 16:9 |
| `1080x1920` | 9:16 |

You can also set the aspect ratio directly:

```typescript
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'

const result = await generateImage({
  adapter: geminiImage('imagen-4.0-generate-001'),
  prompt: 'A landscape photo',
  modelOptions: {
    aspectRatio: '16:9',
  },
})
```

## Model options

`modelOptions` is typed for each model.

### OpenAI gpt-image models

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const result = await generateImage({
  adapter: openaiImage('gpt-image-2.5-flare'),
  prompt: 'A cat wearing a hat',
  modelOptions: {
    quality: 'high', // 'high' | 'medium' | 'low' | 'auto'
    background: 'transparent', // 'transparent' | 'opaque' | 'auto'
    output_format: 'png', // 'png' | 'jpeg' | 'webp'
    moderation: 'low', // 'low' | 'auto'
  },
})
```

`gpt-image-2.5-flare` and `gpt-image-2.5-sunburst` also take `quality: 'xhigh'` and `quality: 'max'`.

### OpenAI DALL-E 3

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

### Gemini Imagen

```typescript ignore
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'

const result = await generateImage({
  adapter: geminiImage('imagen-4.0-generate-001'),
  prompt: 'A beautiful garden',
  modelOptions: {
    aspectRatio: '16:9',
    // PersonGeneration enum values: 'DONT_ALLOW' | 'ALLOW_ADULT' | 'ALLOW_ALL'
    personGeneration: 'ALLOW_ADULT',
    negativePrompt: 'blurry, low quality',
    addWatermark: true,
    outputMimeType: 'image/png', // 'image/png' | 'image/jpeg' | 'image/webp'
  },
})
```

### Gemini native models (Nano Banana)

```typescript
import { generateImage } from '@tanstack/ai'
import { geminiImage, ThinkingLevel } from '@tanstack/ai-gemini'

const result = await generateImage({
  adapter: geminiImage('gemini-nano-banana-2.1'),
  prompt: 'A beautiful garden',
  size: '16:9_4K',
  modelOptions: {
    seed: 42,
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    systemInstruction: 'Always render in watercolor.',
    // imageConfig replaces one field from size. The 16:9 ratio from size stays.
    // imageConfig accepts only aspectRatio and imageSize.
    imageConfig: { imageSize: '2K' },
  },
})
```

What to know:

- `thinkingConfig.thinkingLevel` takes `ThinkingLevel.MINIMAL`, `ThinkingLevel.LOW`, `ThinkingLevel.MEDIUM`, or `ThinkingLevel.HIGH`.
- `thinkingConfig.thinkingBudget` throws.
- If `systemInstruction` contains an image, a file, or a tool call, the call throws.
- `previous_interaction_id` edits the last image. See [Edit a Gemini native image](./image-generation#edit-a-gemini-native-image).
- The adapter always requests an image.

`safetySettings` takes the `HarmCategory` and `HarmBlockThreshold` enums, so plain strings do not type-check. `@tanstack/ai-gemini` re-exports both, so you do not need `@google/genai` in your own dependencies:

```typescript
import { generateImage } from '@tanstack/ai'
import {
  HarmBlockThreshold,
  HarmCategory,
  geminiImage,
} from '@tanstack/ai-gemini'

const result = await generateImage({
  adapter: geminiImage('gemini-nano-banana-2.1'),
  prompt: 'A beautiful garden',
  modelOptions: {
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
      },
    ],
  },
})
```

## Image inputs

The basics of image-conditioned generation and the reference conventions are in [Image Generation](./image-generation#image-conditioned-generation).

### Source format

`ImagePart.source` takes a URL or inline base64 data:

```typescript ignore
// URL source
{ type: 'image', source: { type: 'url', value: 'https://example.com/img.png' } }

// Inline base64 data (mimeType is required)
{ type: 'image', source: { type: 'data', value: base64String, mimeType: 'image/png' } }
```

### URL inputs

Gemini native models do not download a URL in your runtime. The adapter sends the URL as `uri`, and Gemini reads it. These sources work:

- A public HTTPS URL
- A [Files API](https://ai.google.dev/gemini-api/docs/files) URI
- A `gs://` reference

Some endpoints accept only real bytes:

- OpenAI `/images/edits`, and Sora `input_reference`.
- Gemini **Veo**. Its predict API accepts only inline bytes or a `gs://` reference.

For these endpoints, the adapter must download an HTTP(S) URL and buffer it in memory. On a runtime with little memory (for example Cloudflare Workers), that can run out of memory. As a result, these adapters **throw** on an HTTP(S) URL input by default.

To fix it, do one of these:

- Pass a `data:` URI. It always works.
- For Veo, pass a `gs://` reference.
- On a server with enough memory, turn on `allowUrlFetch`:

```typescript
import { createOpenaiImage } from '@tanstack/ai-openai'

const apiKey = process.env.OPENAI_API_KEY ?? ''

// Download and buffer HTTP(S) URL image inputs.
const adapter = createOpenaiImage('gpt-image-2.5-flare', apiKey, {
  allowUrlFetch: true,
})
```

`createOpenaiVideo` and `createGeminiVideo` take the same `allowUrlFetch` option.

### Role hints with `metadata.role`

When the inputs have different jobs (a mask, a reference, a start frame), set `metadata.role` on each part. The adapter sends each part to the matching provider field. A part with no role uses its position.

| Role | Maps to |
| --- | --- |
| `'reference'` | fal `reference_image_urls`. Gemini multimodal part. Position when the provider has no reference field. |
| `'character'` | Same as `'reference'`. Veo `referenceImages` slot (planned, no Veo adapter yet). |
| `'mask'` | OpenAI `mask` (gpt-image models and dall-e-2). fal `mask_url`. |
| `'control'` | fal `control_image_url` (ControlNet, depth, or pose conditioning) |
| `'start_frame'` | fal `start_image_url`. Veo `image` (planned). Used by `generateVideo`. |
| `'end_frame'` | fal `end_image_url`. Veo `lastFrame` (planned). Used by `generateVideo`. |

### Inpaint with a mask

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'
import { photoUrl, maskUrl } from './urls'

await generateImage({
  adapter: openaiImage('gpt-image-2.5-flare'),
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

### Mix several references

```typescript
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'

await generateImage({
  adapter: geminiImage('gemini-nano-banana-2.1'),
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

Gemini native models get the parts in order, so text can sit between images:

```typescript
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'
import { badExampleUrl, goodExampleUrl } from './urls'

await generateImage({
  adapter: geminiImage('gemini-nano-banana-2.1'),
  prompt: [
    { type: 'text', content: 'Not like this' },
    { type: 'image', source: { type: 'url', value: badExampleUrl } },
    { type: 'text', content: 'more like this' },
    { type: 'image', source: { type: 'url', value: goodExampleUrl } },
  ],
})
```

### Provider limits

| Provider | Behavior |
| --- | --- |
| **OpenAI** | gpt-image models use `images.edit()`, with up to 16 source images and an optional mask. `dall-e-2` uses `images.edit()` with 1 source image only. `dall-e-3` throws (no edit support). |
| **Gemini** | Native models send each prompt part as an Interactions content block, in the same order. Up to 14 input images. The SDK does not enforce that limit. To edit the last image, see [Edit a Gemini native image](./image-generation#edit-a-gemini-native-image). Imagen throws on an image part, and does not chain edits. |
| **fal.ai** | Field names come from a map built from the endpoint types of the fal SDK (for example, nano-banana edit gets `image_urls`, and Fooocus masks get `mask_image_url`). For unknown endpoints: 1 input goes to `image_url`, more go to `image_urls`, `'mask'` goes to `mask_url`, `'control'` goes to `control_image_url`, and `'reference'` or `'character'` go to `reference_image_urls`. Use `modelOptions` for fields that only one endpoint has. |
| **Grok** | grok-imagine models use the xAI `/v1/images/edits` endpoint, with up to 3 source images in request order. The prompt is sent as written. `'mask'` and `'control'` throw (the Imagine API has no match). |
| **OpenRouter** | Prompt parts map 1:1 to multimodal `image_url` and `text` parts, in the same order, and go to the image model. `modelOptions.strength` (0.0 to 1.0) sets the image-to-image influence on models that document it (for example Recraft). One image per request: `numberOfImages` more than 1 throws. |
| **BytePlus** | Seedream models send every input image as a plain reference on the `image` field: up to 14, or 10 on `dola-seedream-5-0-pro-260628`. There is no mask, control, or frame field, so any role other than `'reference'` or `'character'` throws. |
| **Anthropic** | No image generation API. |

## Result shape

```typescript
import type { TokenUsage } from '@tanstack/ai'

interface ImageGenerationResult {
  id: string // unique id for this generation
  model: string // the model used
  images: GeneratedImage[] // the generated images
  // Same TokenUsage shape as chat. Token-billed models also add a breakdown
  // per modality on `promptTokensDetails` (for example text and image input
  // tokens for gpt-image-1). fal sets `usage.billed` instead.
  usage?: TokenUsage
}

interface GeneratedImage {
  b64Json?: string // base64 image data
  url?: string // URL of the image
  revisedPrompt?: string // revised prompt (OpenAI only)
}
```

On a Gemini native model, `id` is the interaction id. Pass it as `previous_interaction_id` on the next edit.

### Cost tracking on fal

fal bills in usage units, not tokens. The fal image adapter puts the billed quantity on `usage.billed` as `{ quantity, unit: 'units' }`. It reads the value from the `x-fal-billable-units` result header.

To get the cost, multiply the quantity by the unit price of the endpoint. Get the price from `GET https://api.fal.ai/v1/models/pricing?endpoint_id=...`.

```typescript
import { generateImage } from '@tanstack/ai'
import { falImage } from '@tanstack/ai-fal'
import { unitPrice } from './pricing'

const result = await generateImage({
  adapter: falImage('fal-ai/flux/dev'),
  prompt: 'a serene mountain lake',
})

if (result.usage?.billed) {
  const { quantity, unit } = result.usage.billed
  const cost = quantity * unitPrice // unitPrice from the fal pricing API
  console.log(`Billed ${quantity} ${unit} (~$${cost})`)
}
```

## Models

### OpenAI

| Model | Images per request |
| --- | --- |
| `gpt-image-2.5-flare` | 1-10 |
| `gpt-image-2.5-sunburst` | 1-10 |
| `gpt-image-2` | 1-10 |
| `gpt-image-1` | 1-10 |
| `gpt-image-1-mini` | 1-10 |
| `dall-e-3` | 1 |
| `dall-e-2` | 1-10 |

### Gemini native models (Nano Banana)

| Model | Description |
| --- | --- |
| `gemini-nano-banana-2.1` | Nano Banana 2.1. 1K, 2K, and 4K, no 512 tier. |
| `gemini-3.1-flash-image` | Nano Banana 2. Fast native image generation. |
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite. Very low latency and low cost. |
| `gemini-3-pro-image` | Nano Banana Pro. Higher quality. |

### Gemini Imagen

| Model | Images per request |
| --- | --- |
| `imagen-4.0-ultra-generate-001` | 1-4 |
| `imagen-4.0-generate-001` | 1-4 |
| `imagen-4.0-fast-generate-001` | 1-4 |

## Errors

The adapters check the input before they call the API. An invalid size throws before the request:

```typescript ignore
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

try {
  const result = await generateImage({
    adapter: openaiImage('dall-e-3'),
    prompt: 'A cat',
    size: '512x512', // not a dall-e-3 size, throws at runtime
  })
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message)
    // "Size "512x512" is not supported by model "dall-e-3".
    //  Supported sizes: 1024x1024, 1792x1024, 1024x1792"
  }
}
```

## API keys

The image adapters read the same environment variables as the text adapters:

- **OpenAI**: `OPENAI_API_KEY`
- **Gemini** (Nano Banana and Imagen): `GOOGLE_API_KEY` or `GEMINI_API_KEY`
- **BytePlus** (Seedream): `ARK_API_KEY` or `BYTEPLUS_API_KEY`

To pass a key in code, use the `create*` factory:

```typescript
import { createOpenaiImage } from '@tanstack/ai-openai'
import { createGeminiImage } from '@tanstack/ai-gemini'

const openaiAdapter = createOpenaiImage('gpt-image-2.5-flare', 'your-openai-api-key')

const geminiAdapter = createGeminiImage(
  'gemini-nano-banana-2.1',
  'your-google-api-key',
)
```
