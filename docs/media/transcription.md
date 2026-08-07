---
title: Transcription
id: transcription
order: 4
description: "Speech-to-text with generateTranscription() — OpenAI Whisper/GPT-4o, Groq, BytePlus, fal.ai."
keywords:
  - tanstack ai
  - transcription
  - speech-to-text
  - asr
  - whisper
  - generateTranscription
  - openai
  - groq
  - fal
---

# Audio Transcription

If you need speech → text → `generateTranscription()`.

**Providers:** OpenAI Whisper / GPT-4o-transcribe · Groq Whisper · BytePlus Seed Speech ASR · fal.ai STT

## Basic usage

### OpenAI (File)

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { audioBuffer } from './audio'

const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mpeg' })

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile,
  language: 'en',
})

console.log(result.text)
```

### Base64 / data URL

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { readFile } from 'fs/promises'

const audioBuffer = await readFile('recording.mp3')
const base64Audio = audioBuffer.toString('base64')

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: base64Audio,
})
```

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { base64AudioData } from './audio'

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: `data:audio/mpeg;base64,${base64AudioData}`,
})
```

### Groq

Accepts `File`, `Blob`, `ArrayBuffer`, base64, data URL, or `https://` URL (forwarded without re-upload). Formats: `json`, `text`, `verbose_json` (default). `srt` / `vtt` throw.

```typescript
import { generateTranscription } from '@tanstack/ai'
import { groqTranscription } from '@tanstack/ai-groq'

const result = await generateTranscription({
  adapter: groqTranscription('whisper-large-v3-turbo'),
  audio: 'https://example.com/recording.mp3',
  language: 'en',
})

for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s → ${segment.end}s] ${segment.text}`)
}
```

`modelOptions`: `temperature`, `timestamp_granularities` (`['word']` / `['segment']` / both).

### BytePlus Seed ASR

Key: `BYTEPLUS_VOICE_API_KEY`. Sync; up to 2h / 100 MB.

```typescript
import { generateTranscription } from '@tanstack/ai'
import { byteplusTranscription } from '@tanstack/ai-byteplus'

const result = await generateTranscription({
  adapter: byteplusTranscription('seed-asr'),
  audio: 'https://example.com/recording.mp3',
  language: 'en',
  modelOptions: { enable_punc: true, enable_speaker_info: true },
})

for (const segment of result.segments ?? []) {
  console.log(`[${segment.speaker ?? 'unknown'}] ${segment.text}`)
}
```

`modelOptions`: `enable_itn`, `enable_punc`, `enable_ddc`, `enable_speaker_info`, `show_utterances`.

### fal.ai

```typescript
import { generateTranscription } from '@tanstack/ai'
import { falTranscription } from '@tanstack/ai-fal'

const result = await generateTranscription({
  adapter: falTranscription('fal-ai/whisper'),
  audio: 'https://example.com/recording.mp3',
  language: 'en',
})

for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s → ${segment.end}s] ${segment.text}`)
}
```

## Options

| Option | Type | Description |
|--------|------|-------------|
| `audio` | `File \| string` | Required — file or base64/data URL |
| `language` | `string` | ISO code (`en`, `es`, …) |
| `prompt` | `string` | Style/terms guide. Not for `gpt-4o-transcribe-diarize` |
| `responseFormat` | `'json' \| 'text' \| 'srt' \| 'verbose_json' \| 'vtt'` | Output format |

Specify `language` when known — better accuracy and latency.

## Full example (verbose + timestamps)

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { readFile } from 'fs/promises'

async function transcribeAudio(filepath: string) {
  const audioBuffer = await readFile(filepath)
  const audioFile = new File([audioBuffer], filepath.split('/').pop()!, {
    type: 'audio/mpeg',
  })

  const result = await generateTranscription({
    adapter: openaiTranscription('whisper-1'),
    audio: audioFile,
    language: 'en',
    responseFormat: 'verbose_json',
    modelOptions: {
      timestamp_granularities: ['segment', 'word'],
    },
  })

  console.log('Full text:', result.text)
  for (const segment of result.segments ?? []) {
    console.log(
      `[${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s]: ${segment.text}`,
    )
  }
  return result
}

await transcribeAudio('./meeting-recording.mp3')
```

## Browser → server

For mic capture, prefer [Audio Recording](./audio-recording) + a data URL. Minimal FormData path:

```typescript ignore
// api/transcribe.ts
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const formData = await request.formData()
  const audioFile = formData.get('audio')
  if (!(audioFile instanceof File)) {
    throw new Error('Expected an audio file under "audio"')
  }

  const result = await generateTranscription({
    adapter: openaiTranscription('whisper-1'),
    audio: audioFile,
  })

  return Response.json(result)
}
```

## Full-stack

Long files: [Generation Persistence](../persistence/generation-persistence).

### 1. Server (SSE)

```typescript ignore
// routes/api/transcribe.ts
import {
  generateTranscription,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/transcribe')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { audio, language, model } = body.data

        const stream = generateTranscription({
          adapter: openaiTranscription(model ?? 'whisper-1'),
          audio,
          language,
          stream: true,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

JSON body = base64/data URL. File uploads = FormData endpoint above.

### 2. Client

```tsx
import { useTranscription, fetchServerSentEvents } from '@tanstack/ai-react'

function AudioTranscriber() {
  const { generate, result, isLoading, error } = useTranscription({
    connection: fetchServerSentEvents('/api/transcribe'),
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const buffer = await file.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''),
    )
    await generate({ audio: `data:${file.type};base64,${base64}`, language: 'en' })
  }

  return (
    <div>
      <input type="file" accept="audio/*" onChange={handleFileUpload} />
      {isLoading && <p>Transcribing...</p>}
      {error && <p>Error: {error.message}</p>}
      {result && (
        <div>
          <p>{result.text}</p>
          {result.duration && <p>Duration: {result.duration}s</p>}
        </div>
      )}
    </div>
  )
}
```

Other transports: [Generations](./generations#transports-in-full). Hook API: [Generation Hooks](./generation-hooks).

## Advanced

### Other transports

#### Direct

```typescript ignore
import { createServerFn } from '@tanstack/react-start'
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

export const transcribeFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { audio: string; language?: string }) => data)
  .handler(async ({ data }) => {
    return generateTranscription({
      adapter: openaiTranscription('whisper-1'),
      audio: data.audio,
      language: data.language,
    })
  })
```

```tsx
import { useTranscription } from '@tanstack/ai-react'
import { transcribeFn } from '../lib/server-functions'

function AudioTranscriber() {
  const { generate, result, isLoading } = useTranscription({
    fetcher: (input) => transcribeFn({ data: input }),
  })
}
```

#### Server function + SSE

```typescript ignore
import { createServerFn } from '@tanstack/react-start'
import {
  generateTranscription,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

export const transcribeStreamFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { audio: string; language?: string }) => data)
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateTranscription({
        adapter: openaiTranscription('whisper-1'),
        audio: data.audio,
        language: data.language,
        stream: true,
      }),
    )
  })
```

### OpenAI model options

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

| Option | Type | Description |
|--------|------|-------------|
| `temperature` | `number` | 0–1 |
| `timestamp_granularities` | `Array<'word' \| 'segment'>` | `whisper-1` + `verbose_json` |
| `include` | `string[]` | e.g. `logprobs` |
| `response_format` | includes `'diarized_json'` | Raw OpenAI format |
| `chunking_strategy` | `'auto' \| VAD object \| null` | Required for long diarize inputs; adapter defaults `'auto'` for diarize model |
| `known_speaker_names` / `known_speaker_references` | string arrays | Diarization labels + 2–10s samples |

`responseFormat` and `prompt` are **top-level**, not `modelOptions`.

### Speaker diarization

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { meetingAudioFile } from './audio'

const result = await generateTranscription({
  adapter: openaiTranscription('gpt-4o-transcribe-diarize'),
  audio: meetingAudioFile,
  modelOptions: {
    known_speaker_names: ['agent', 'customer'],
    known_speaker_references: [
      'data:audio/wav;base64,...',
      'data:audio/wav;base64,...',
    ],
  },
})

for (const segment of result.segments ?? []) {
  console.log(segment.speaker, segment.start, segment.end, segment.text)
}
```

Defaults to `diarized_json` + `chunking_strategy: 'auto'`. Max 4 known speakers (names + refs together). No `prompt` / `include` / `timestamp_granularities` on this model.

### Result shape

```typescript
interface TranscriptionResult {
  id: string
  model: string
  text: string
  language?: string
  duration?: number
  segments?: Array<{
    id: number
    start: number
    end: number
    text: string
    confidence?: number
    speaker?: string
  }>
  words?: Array<{ word: string; start: number; end: number }>
}
```

### Models / formats

| Model | Use |
|-------|-----|
| `whisper-1` | General |
| `gpt-4o-transcribe` | Higher accuracy |
| `gpt-4o-transcribe-diarize` | Multi-speaker |
| `gpt-4o-mini-transcribe` | Cost / speed |

OpenAI audio: `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `wav`, `webm`, `flac`, `ogg`. Max **25 MB**.

### Errors / keys

Debug with `debug: true` — [Debug Logging](../advanced/debug-logging).

Env: `OPENAI_API_KEY` · `BYTEPLUS_VOICE_API_KEY`

```typescript
import { createOpenaiTranscription } from '@tanstack/ai-openai'

const adapter = createOpenaiTranscription('whisper-1', 'your-openai-api-key')
```

1. Prefer quieter, higher-quality audio.
2. Always pass `language` when known.
3. Split files over 25 MB.
4. Use `prompt` for domain vocabulary.
5. Captions → `verbose_json` + `timestamp_granularities`.
