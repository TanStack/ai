---
id: generateImage
title: generateImage
---

# Function: generateImage()

```ts
function generateImage<TAdapter>(options): ImageActivityResult;
```

Defined in: [activities/generateImage/index.ts:139](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateImage/index.ts#L139)

Image activity - generates images from text prompts.

Uses AI image generation models to create images based on natural language descriptions.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`ImageAdapter`](../interfaces/ImageAdapter.md)\<`string`, `object`, `any`, `any`\>

## Parameters

### options

`ImageActivityOptions`\<`TAdapter`\>

## Returns

`ImageActivityResult`

## Examples

```ts
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const result = await generateImage({
  adapter: openaiImage('dall-e-3'),
  prompt: 'A serene mountain landscape at sunset'
})

console.log(result.images[0].url)
```

```ts
const result = await generateImage({
  adapter: openaiImage('dall-e-2'),
  prompt: 'A cute robot mascot',
  numberOfImages: 4,
  size: '512x512'
})

result.images.forEach((image, i) => {
  console.log(`Image ${i + 1}: ${image.url}`)
})
```

```ts
const result = await generateImage({
  adapter: openaiImage('dall-e-3'),
  prompt: 'A professional headshot photo',
  size: '1024x1024',
  modelOptions: {
    quality: 'hd',
    style: 'natural'
  }
})
```
