---
id: generateTranscription
title: generateTranscription
---

# Function: generateTranscription()

```ts
function generateTranscription<TAdapter, TStream>(options): TranscriptionActivityResult<TStream>;
```

Defined in: [packages/typescript/ai/src/activities/generateTranscription/index.ts:146](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateTranscription/index.ts#L146)

Transcription activity - converts audio to text.

Uses AI speech-to-text models to transcribe audio content.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`TranscriptionAdapter`](../interfaces/TranscriptionAdapter.md)\<`string`, `TranscriptionProviderOptions`\<`TAdapter`\>\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`TranscriptionActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`TranscriptionActivityResult`\<`TStream`\>

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

```ts
for await (const chunk of generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile,
  stream: true
})) {
  console.log(chunk)
}
```
