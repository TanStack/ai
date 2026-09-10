---
id: generateTranscription
title: generateTranscription
---

# Function: generateTranscription()

```ts
function generateTranscription<TAdapter, TStream>(options): TranscriptionActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/generateTranscription/index.ts:189](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateTranscription/index.ts#L189)

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

**Transcribe an audio file**

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

**With verbose output for timestamps**

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

**Streaming transcription result**

```ts
for await (const chunk of generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile,
  stream: true
})) {
  console.log(chunk)
}
```
