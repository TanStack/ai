---
id: generateTranscription
title: generateTranscription
---

# Function: generateTranscription()

```ts
function generateTranscription<TAdapter>(options): TranscriptionActivityResult;
```

Defined in: [activities/generateTranscription/index.ts:105](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateTranscription/index.ts#L105)

Transcription activity - converts audio to text.

Uses AI speech-to-text models to transcribe audio content.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`TranscriptionAdapter`](../interfaces/TranscriptionAdapter.md)\<`string`, `object`\>

## Parameters

### options

`TranscriptionActivityOptions`\<`TAdapter`\>

## Returns

`TranscriptionActivityResult`

## Examples

```ts
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile, // File, Blob, or base64 string
  language: 'en'
})

console.log(result.text)
```

```ts
const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile,
  responseFormat: 'verbose_json'
})

result.segments?.forEach(segment => {
  console.log(`[${segment.start}s - ${segment.end}s]: ${segment.text}`)
})
```
