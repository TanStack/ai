---
id: generateSpeech
title: generateSpeech
---

# Function: generateSpeech()

```ts
function generateSpeech<TAdapter>(options): TTSActivityResult;
```

Defined in: [activities/generateSpeech/index.ts:103](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateSpeech/index.ts#L103)

TTS activity - generates speech from text.

Uses AI text-to-speech models to create audio from natural language text.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`TTSAdapter`](../interfaces/TTSAdapter.md)\<`string`, `object`\>

## Parameters

### options

`TTSActivityOptions`\<`TAdapter`\>

## Returns

`TTSActivityResult`

## Examples

```ts
import { generateSpeech } from '@tanstack/ai'
import { openaiTTS } from '@tanstack/ai-openai'

const result = await generateSpeech({
  adapter: openaiTTS('tts-1-hd'),
  text: 'Hello, welcome to TanStack AI!',
  voice: 'nova'
})

console.log(result.audio) // base64-encoded audio
```

```ts
const result = await generateSpeech({
  adapter: openaiTTS('tts-1'),
  text: 'This is slower speech.',
  voice: 'alloy',
  format: 'wav',
  speed: 0.8
})
```
