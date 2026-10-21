---
title: "Transcription: Advanced"
id: transcription-advanced
order: 4.1
description: "Provider examples, OpenAI model options, speaker diarization, the result type, audio formats, errors, and API keys for transcription in TanStack AI."
keywords:
  - tanstack ai
  - transcription
  - speech-to-text
  - diarization
  - whisper
  - generateTranscription
---

This page holds the details for [Transcription](./transcription). Start there for the quick setup.

## Provider examples

### Groq

Groq runs Whisper large-v3 and large-v3-turbo. The `audio` input accepts the usual types and also an `https://` URL. Groq reads the URL directly, so the audio is not uploaded again.

```typescript
import { generateTranscription } from '@tanstack/ai'
import { groqTranscription } from '@tanstack/ai-groq'

const result = await generateTranscription({
  adapter: groqTranscription('whisper-large-v3-turbo'),
  audio: 'https://example.com/recording.mp3',
  language: 'en',
})

console.log(result.text)
console.log(result.language)

// verbose_json is the default, so segments carry start and end times
for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s - ${segment.end}s] ${segment.text}`)
}
```

Groq details:

- `responseFormat` takes `json`, `text`, or `verbose_json` (the default).
- `srt` and `vtt` throw.
- `modelOptions` takes `temperature` and `timestamp_granularities` (`['word']`, `['segment']`, or both).

### BytePlus

BytePlus Seed Speech ASR is synchronous: the audio goes in, the text comes out, with no polling. It reads `BYTEPLUS_VOICE_API_KEY`, not the `ARK_API_KEY` that the BytePlus chat, image, and video adapters use.

The audio can be a `File`, base64, a data URL, or a public URL. The limit is two hours and 100 MB.

```typescript
import { generateTranscription } from '@tanstack/ai'
import { byteplusTranscription } from '@tanstack/ai-byteplus'

const result = await generateTranscription({
  adapter: byteplusTranscription('seed-asr'),
  audio: 'https://example.com/recording.mp3',
  language: 'en',
  modelOptions: { enable_punc: true, enable_speaker_info: true },
})

console.log(result.text)

// With enable_speaker_info, each segment has a speaker label
for (const segment of result.segments ?? []) {
  console.log(`[${segment.speaker ?? 'unknown'}] ${segment.text}`)
}
```

BytePlus `modelOptions`:

| Option | What it does |
| --- | --- |
| `enable_itn` | Writes spoken numbers and dates as digits |
| `enable_punc` | Adds punctuation |
| `enable_ddc` | Removes fillers and stutters |
| `enable_speaker_info` | Adds speaker labels |
| `show_utterances` | Adds a breakdown per utterance. On by default. |

### fal.ai

fal.ai has Whisper, Wizper, and other speech-to-text models. The `audio` input accepts a URL, a `File`, a `Blob`, or an `ArrayBuffer`. The adapter wraps an `ArrayBuffer` in a `Blob` for you.

```typescript
import { generateTranscription } from '@tanstack/ai'
import { falTranscription } from '@tanstack/ai-fal'

const result = await generateTranscription({
  adapter: falTranscription('fal-ai/whisper'),
  audio: 'https://example.com/recording.mp3',
  language: 'en',
})

console.log(result.text)
console.log(result.language)

// Models that return word or chunk timestamps fill result.segments
for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s - ${segment.end}s] ${segment.text}`)
}
```

### Other providers

ElevenLabs, xAI, Cloudflare, and Lovable use the same `generateTranscription()` call. Their adapter pages show the setup:

- [ElevenLabs](../adapters/elevenlabs#transcription)
- [Grok (xAI)](../adapters/grok)
- [Cloudflare](../adapters/cloudflare)
- [Lovable](../adapters/lovable)

## Other transports

The quick setup uses a streaming route. With TanStack Start, you can call a server function instead. The [Generations](./generations#transports-in-full) page explains all three transports.

### Server function that returns JSON

```typescript ignore
// lib/server-functions.ts
import { createServerFn } from '@tanstack/react-start'
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

export const transcribeFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { audio: string; language?: string }) => data)
  .handler(async ({ data }) => {
    return generateTranscription({
      adapter: openaiTranscription('gpt-4o-transcribe'),
      audio: data.audio,
      language: data.language,
    })
  })
```

```tsx
import { useTranscription } from '@tanstack/ai-react'
import { transcribeFn } from '../lib/server-functions'

export function Transcriber() {
  const { generate, result, isLoading } = useTranscription({
    fetcher: (input) => transcribeFn({ data: input }),
  })
  // Render the same way as in the quick setup.
}
```

### Server function that streams

```typescript ignore
// lib/server-functions.ts
import { createServerFn } from '@tanstack/react-start'
import { generateTranscription, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

export const transcribeStreamFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { audio: string; language?: string }) => data)
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateTranscription({
        adapter: openaiTranscription('gpt-4o-transcribe'),
        audio: data.audio,
        language: data.language,
        stream: true,
      }),
    )
  })
```

```tsx
import { useTranscription } from '@tanstack/ai-react'
import { transcribeStreamFn } from '../lib/server-functions'

export function Transcriber() {
  const { generate, result, isLoading } = useTranscription({
    fetcher: (input) => {
      if (typeof input.audio !== 'string') {
        throw new Error('Expected base64 or data URL audio')
      }
      return transcribeStreamFn({
        data: { ...input, audio: input.audio },
      })
    },
  })
  // Render the same way as in the quick setup.
}
```

### Upload a file with FormData

For a large file, you can skip the JSON body and post the file itself. This route does not use the hook. It returns the result as JSON.

```typescript ignore
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const formData = await request.formData()
  const audioFile = formData.get('audio')
  if (!(audioFile instanceof File)) {
    return new Response('Expected an audio file under "audio".', { status: 400 })
  }

  const result = await generateTranscription({
    adapter: openaiTranscription('gpt-4o-transcribe'),
    audio: audioFile,
  })
  return Response.json(result)
}
```

In the browser, put the file in a `FormData` under `audio` and `POST` it to this route.

## OpenAI model options

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { audioFile } from './audio'

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile,
  responseFormat: 'verbose_json',
  prompt: 'Technical terms: API, SDK, CLI',
  modelOptions: {
    temperature: 0,
    timestamp_granularities: ['word', 'segment'],
  },
})
```

`responseFormat` and `prompt` are top-level options on `generateTranscription()`. They are not `modelOptions` keys.

| Option | Type | Description |
| --- | --- | --- |
| `temperature` | `number` | Sampling temperature, from 0 to 1. A lower value gives more predictable text. |
| `timestamp_granularities` | `Array<'word' \| 'segment'>` | Which timestamps to fill. Only `whisper-1`. Needs a top-level `responseFormat: 'verbose_json'`. |
| `include` | `string[]` | Extra values in the response, for example `logprobs` |
| `response_format` | `'json' \| 'text' \| 'srt' \| 'verbose_json' \| 'vtt' \| 'diarized_json'` | The raw OpenAI response format. Use `diarized_json` for speaker labels. |
| `chunking_strategy` | `'auto' \| { type: 'server_vad', ... } \| null` | How OpenAI splits the audio. Works with any model. If you do not set it, the audio is transcribed as one block. OpenAI requires it for `gpt-4o-transcribe-diarize` input longer than 30 seconds, so the adapter sets `'auto'` for that model. |
| `known_speaker_names` | `string[]` | Up to four speaker labels for diarization |
| `known_speaker_references` | `string[]` | Data URL samples of 2 to 10 seconds that match `known_speaker_names` |

### Response formats

| Format | Description |
| --- | --- |
| `json` | JSON with the text |
| `text` | Plain text only |
| `srt` | SubRip subtitles |
| `verbose_json` | JSON with timestamps and segments |
| `vtt` | WebVTT subtitles |

`gpt-4o-transcribe-diarize` also takes `modelOptions.response_format: 'diarized_json'` for segments with speaker labels.

### Speaker diarization

Use `gpt-4o-transcribe-diarize` when you need to know who spoke. If you set no response format, the adapter does two things:

- It sets `response_format: 'diarized_json'`.
- It sends `chunking_strategy: 'auto'`, unless you set your own strategy.

A top-level `responseFormat: 'json'` or `'text'` turns the speaker segments off.

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { agentSampleUrl, customerSampleUrl, meetingAudioFile } from './audio'

const result = await generateTranscription({
  adapter: openaiTranscription('gpt-4o-transcribe-diarize'),
  audio: meetingAudioFile,
  modelOptions: {
    known_speaker_names: ['agent', 'customer'],
    known_speaker_references: [agentSampleUrl, customerSampleUrl],
  },
})

for (const segment of result.segments ?? []) {
  console.log(segment.speaker, segment.start, segment.end, segment.text)
}
```

The adapter checks two rules before it calls the API:

- You can send up to four known speaker references. Send `known_speaker_names` and `known_speaker_references` together, with the same length.
- The diarization model does not support `prompt`, `include`, or `timestamp_granularities`. The adapter rejects these options.

## Result type

```typescript
interface TranscriptionResult {
  id: string // unique id
  model: string // the model used
  text: string // the full text
  language?: string // detected or given language
  duration?: number // audio length in seconds
  segments?: Array<{
    id: number
    start: number // start time in seconds
    end: number // end time in seconds
    text: string
    confidence?: number // 0 to 1, when available
    speaker?: string // when diarization is on
  }>
  words?: Array<{
    word: string
    start: number
    end: number
  }>
}
```

## OpenAI models and audio formats

| Model | Description | Use it for |
| --- | --- | --- |
| `gpt-4o-transcribe` | GPT-4o transcription | Higher accuracy |
| `gpt-4o-mini-transcribe` | A smaller, faster model | Lower cost |
| `gpt-4o-transcribe-diarize` | Adds speaker labels | Audio with more than one speaker |
| `whisper-1` | Whisper large-v2 | General transcription, word timestamps |

OpenAI accepts these audio formats: `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`, `flac`, and `ogg`. The maximum file size is 25 MB.

## Errors

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { audioFile } from './audio'

try {
  const result = await generateTranscription({
    adapter: openaiTranscription('gpt-4o-transcribe'),
    audio: audioFile,
  })
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('Invalid file format')) {
      console.error('Unsupported audio format')
    } else if (error.message.includes('File too large')) {
      console.error('Audio file exceeds 25 MB limit')
    } else if (error.message.includes('Audio file is too short')) {
      console.error('Audio must be at least 0.1 seconds')
    } else {
      console.error('Transcription error:', error.message)
    }
  }
}
```

If the text is wrong, the segments are empty, or the provider rejects your audio format, pass `debug: true` to `generateTranscription()`. It logs the request and every raw provider chunk. See [Debug Logging](../advanced/debug-logging).

## API keys

By default, each adapter reads its key from the environment. The variables are in the [Providers](./transcription#providers) table.

To pass a key in code, use the `create*` factory:

```typescript
import { createOpenaiTranscription } from '@tanstack/ai-openai'

const adapter = createOpenaiTranscription('gpt-4o-transcribe', 'your-openai-api-key')
```

## Tips for better results

- **Audio quality.** Less background noise gives more accurate text.
- **Language.** If you know the language, set `language`. The result is more accurate and faster.
- **File size.** Keep files under 25 MB for OpenAI. Split longer recordings into parts.
- **Format.** MP3 is a good balance of quality and size. WAV and FLAC give the highest quality.
- **Vocabulary.** Put names and technical terms in `prompt`.

For timestamps, set `responseFormat: 'verbose_json'` and `modelOptions.timestamp_granularities`. For several speakers, use `gpt-4o-transcribe-diarize` and keep `chunking_strategy: 'auto'`, unless you need your own voice activity settings.
