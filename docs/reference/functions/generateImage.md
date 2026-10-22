---
id: generateImage
title: generateImage
---

```ts
function generateImage<TAdapter, TStream>(options): ImageActivityResult<TStream>;
```

Defined in: packages/ai/src/activities/generateImage/index.ts:249

Image activity - generates images from text prompts.

Uses AI image generation models to create images based on natural language descriptions.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`ImageAdapter`](../interfaces/ImageAdapter.md)\<`string`, `any`, `any`, `any`, [`ModelInputModalitiesByName`](../type-aliases/ModelInputModalitiesByName.md)\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`ImageActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`ImageActivityResult`\<`TStream`\>

## Examples

**Generate a single image**

```ts
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const result = await generateImage({
  adapter: openaiImage('gpt-image-2.5-flare'),
  prompt: 'A serene mountain landscape at sunset',
  threadId,
})

console.log(result.images[0].b64Json)
```

**Generate multiple images**

```ts
const result = await generateImage({
  adapter: openaiImage('gpt-image-1-mini'),
  prompt: 'A cute robot mascot',
  threadId,
  numberOfImages: 4,
  size: '1024x1024'
})

result.images.forEach((image, i) => {
  console.log(`Image ${i + 1}: ${image.b64Json}`)
})
```

**With provider-specific options**

```ts
const result = await generateImage({
  adapter: openaiImage('gpt-image-2.5-flare'),
  prompt: 'A professional headshot photo',
  threadId,
  size: '1024x1024',
  modelOptions: {
    quality: 'high',
    background: 'transparent'
  }
})
```
