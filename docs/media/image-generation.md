---
title: Image Generation
id: image-generation
order: 5
description: "Generate and edit images with OpenAI, Gemini, BytePlus Seedream, Grok, OpenRouter, and fal.ai through one generateImage() call and the useGenerateImage hook."
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

Your app needs a picture from a text prompt: a product shot, an avatar, a header image. `generateImage()` sends the prompt to an image model and gives you the images back. The `useGenerateImage` hook shows them in the browser.

## Generate an image

You need a React app with a server route, and an OpenAI API key. This takes about 5 minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai

<!-- ::end:tabs -->

2. Put your key in `.env`:

```bash
OPENAI_API_KEY=sk-...
```

3. Add a `POST` route at `/api/generate/image`:

```typescript
import {
  generateImage,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { input } = await generationParamsFromRequest('image', request)
  if (typeof input.prompt !== 'string') {
    return new Response('Send a text prompt.', { status: 400 })
  }

  const stream = generateImage({
    adapter: openaiImage('gpt-image-2.5-flare'),
    prompt: input.prompt,
    size: '1024x1024',
    stream: true,
  })
  return toServerSentEventsResponse(stream)
}
```

4. Call the route from a component:

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useGenerateImage } from '@tanstack/ai-react'

export function ImageGenerator() {
  const [prompt, setPrompt] = useState('')
  const { generate, result, isLoading, error } = useGenerateImage({
    connection: fetchServerSentEvents('/api/generate/image'),
  })

  return (
    <div>
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe an image..."
      />
      <button
        onClick={() => generate({ prompt })}
        disabled={isLoading || !prompt.trim()}
      >
        {isLoading ? 'Generating...' : 'Generate'}
      </button>
      {error && <p role="alert">{error.message}</p>}
      {result?.images.map((img, i) => (
        <img
          key={i}
          src={img.url || `data:image/png;base64,${img.b64Json}`}
          alt={img.revisedPrompt || 'Generated image'}
        />
      ))}
    </div>
  )
}
```

Type a prompt and click **Generate**. The image shows up below the button.

For a full React and TanStack Start walkthrough with OpenRouter, open [Generate Image](../tutorials/generate-image).

## How it works

- `generateImage()` sends the prompt to the model that the adapter names.
- The result has an `images` array. Each image has a `url`, or base64 bytes in `b64Json`, depending on the provider.
- With `stream: true`, the route sends the result to the hook as Server-Sent Events. The hook stores it on `result`.

You can also call `generateImage()` without the hook, for example in a script:

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const result = await generateImage({
  adapter: openaiImage('gpt-image-2.5-flare'),
  prompt: 'A beautiful sunset over mountains',
})

console.log(result.images[0]?.b64Json)
```

The shared model for every generation (transports, events, errors) is in [Generations](./generations). The hook options and return values are in [Generation Hooks](./generation-hooks#options). To keep images after a reload, or after the provider URLs expire, add [Generation Persistence](../persistence/generation-persistence).

## Options

| Option | Type | Description |
| --- | --- | --- |
| `adapter` | `ImageAdapter` | The image adapter and model (required) |
| `prompt` | `string \| MediaPromptPart[]` | What to draw (required). An array of text and image parts works on models that take reference images. See [Image-conditioned generation](#image-conditioned-generation). |
| `numberOfImages` | `number` | How many images to make |
| `size` | `string` | Image size. The format depends on the model. |
| `modelOptions` | `object` | Model-specific options, typed per model |

## Pick a provider

Change the adapter. The rest of the code stays the same.

| Provider | Adapter | Package | Newest model | Key |
| --- | --- | --- | --- | --- |
| OpenAI | `openaiImage` | `@tanstack/ai-openai` | `gpt-image-2.5-flare` | `OPENAI_API_KEY` |
| Gemini | `geminiImage` | `@tanstack/ai-gemini` | `gemini-nano-banana-2.1` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| BytePlus | `byteplusImage` | `@tanstack/ai-byteplus` | `dola-seedream-5-0-pro-260628` | `ARK_API_KEY` or `BYTEPLUS_API_KEY` |
| Grok | `grokImage` | `@tanstack/ai-grok` | `grok-imagine-image-2.0` | `XAI_API_KEY` |
| OpenRouter | `openRouterImage` | `@tanstack/ai-openrouter` | `google/gemini-nano-banana-2.1` | `OPENROUTER_API_KEY` |
| fal.ai | `falImage` | `@tanstack/ai-fal` | Any of 600+ fal endpoints, for example `fal-ai/flux/dev` | `FAL_KEY` |

Anthropic has no image generation API.

### Gemini

Gemini has two groups of image models:

- **Native models (Nano Banana)**, such as `gemini-nano-banana-2.1`. They use the Interactions API. `size` is `"<aspectRatio>_<resolution>"`.
- **Imagen models**, such as `imagen-4.0-generate-001`. They use the `generateImages` API. `size` is `WIDTHxHEIGHT`.

```typescript
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'

const native = await generateImage({
  adapter: geminiImage('gemini-nano-banana-2.1'),
  prompt: 'A futuristic cityscape at night',
  size: '16:9_4K',
})

const imagen = await generateImage({
  adapter: geminiImage('imagen-4.0-generate-001'),
  prompt: 'A futuristic cityscape at night',
})

console.log(native.images[0]?.b64Json)
```

### BytePlus

Seedream `size` takes a token (`1K`, `2K`, `4K`) or explicit pixels (`2048x2048`). Do not mix the two.

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

Seedream works differently from the other providers in three ways:

- **`watermark` is `true` by default.** BytePlus puts "AI generated" in the corner. Set it to `false` to remove it.
- **`numberOfImages` is a maximum.** Seedream has no `n` parameter. A request for four images can return two.
- **Image URLs expire after 24 hours.** For inline bytes, pass `response_format: 'b64_json'` in `modelOptions`.

See the [BytePlus adapter](../adapters/byteplus#image-generation-seedream) for more.

## Edit a Gemini native image

You have an image from a Gemini native model. You want to change it, without a second upload of that image.

1. Generate the first image.
2. Call `generateImage` again. Set `previous_interaction_id` to `first.id`, and write only the change in `prompt`.
3. Read `edited.images` for the new picture.

```typescript
import { generateImage } from '@tanstack/ai'
import { geminiImage } from '@tanstack/ai-gemini'

const adapter = geminiImage('gemini-nano-banana-2.1')

const first = await generateImage({
  adapter,
  prompt: 'A red bicycle on a quiet street',
})

const edited = await generateImage({
  adapter,
  prompt: 'Make the bicycle blue',
  modelOptions: { previous_interaction_id: first.id },
})
```

`edited.images` holds the new picture. `edited.id` is the id for the next edit.

Rules for the edit:

- Leave `store` unset. The API default is `true`. If you set `store` to `false`, a later call cannot use that id.
- A free tier keeps a stored interaction for 1 day. A paid tier keeps it for 55 days.
- If the edit needs a new reference image, add that image part on this call. Do not send the image from `first` again.
- If the model is Imagen, do not pass `previous_interaction_id`. The call throws.

The Interactions API is in Beta.

## Image-conditioned generation

You want a new image that starts from an image you have: a restyle, an edit, or a mix of references. Pass `prompt` as an ordered array of text and image parts:

```typescript
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

await generateImage({
  adapter: openaiImage('gpt-image-2.5-flare'),
  prompt: [
    { type: 'text', content: 'Turn this into a cinematic product photo' },
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/product.png' },
    },
  ],
})
```

What to know:

- **Part order matters.** Gemini native models and OpenRouter get the parts in the same order, so text can refer to the image next to it. OpenAI, fal, and xAI take the image parts out and join the text parts into one prompt.
- **Types check the model.** An image part on a text-only model (for example `dall-e-3` or Imagen) is a type error.
- **Unsupported adapters throw.** An adapter that cannot take image inputs throws a runtime error. It does not drop the images.

Masks, roles, URL rules, and per-provider limits are in [Image Generation: Advanced](./image-generation-advanced#role-hints-with-metadatarole).

### Referencing images from your prompt

The SDK sends your prompt text as you wrote it. It never adds or changes reference markers. To point at a specific input image, use the convention of the provider:

| Provider | Convention | Example |
| --- | --- | --- |
| **OpenAI** (gpt-image) | Numbered prose, from the OpenAI prompting guide | `"apply the style of image 2 to image 1"` |
| **FLUX.2 on fal / BFL** | Numbered prose (BFL reads `image N`) | `"subject from image 1, style from image 2"` |
| **Gemini** (native models) | Describe the reference by its content or role | `"using the attached fabric sample as the texture"` |
| **fal Kling / Seedance endpoints** | `@` tags, counted from 1 in input order | `"Put @Image1 in the style of @Image2"` |
| **xAI grok-imagine** | No syntax. xAI uses the request order. | `"render the product in the style of the second image"` |

To remember which part is "image 2", you can add a `metadata.tag` label. The SDK ignores it:

```typescript
import type { MediaPromptPart } from '@tanstack/ai'

const productUrl = 'https://example.com/product.png'
const styleUrl = 'https://example.com/style.png'

const prompt: Array<MediaPromptPart> = [
  { type: 'text', content: 'Put @Image1 in the style of @Image2' },
  {
    type: 'image',
    source: { type: 'url', value: productUrl },
    metadata: { tag: 'product' },
  },
  {
    type: 'image',
    source: { type: 'url', value: styleUrl },
    metadata: { tag: 'style' },
  },
]
```

## Advanced

Sizes per model, every model option, masks and role hints, URL inputs, provider limits, the result shape, cost tracking, errors, and explicit API keys are in [Image Generation: Advanced](./image-generation-advanced).
