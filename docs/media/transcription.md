---
title: Transcription
id: transcription
order: 4
description: "Transcribe audio to text with OpenAI Whisper and GPT-4o transcription models (including speaker diarization), Groq Whisper, and fal.ai STT models via TanStack AI's generateTranscription() API."
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

TanStack AI provides support for audio transcription (speech-to-text) through dedicated transcription adapters. This guide covers how to convert spoken audio into text using OpenAI's Whisper and GPT-4o transcription models, Groq's hosted Whisper models, and fal.ai STT models.

## Overview

Audio transcription is handled by transcription adapters that follow the same tree-shakeable architecture as other adapters in TanStack AI.

Currently supported:
- **OpenAI**: Whisper-1, GPT-4o-transcribe, GPT-4o-mini-transcribe, GPT-4o-transcribe-diarize
- **Groq**: whisper-large-v3-turbo, whisper-large-v3
- **fal.ai**: Whisper, Wizper, speech-to-text turbo, ElevenLabs speech-to-text

## Basic Usage

### OpenAI Transcription

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { audioBuffer } from './audio'

// Transcribe audio from a file (the adapter uses OPENAI_API_KEY from environment)
const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mpeg' })

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile,
  language: 'en',
})

console.log(result.text) // The transcribed text
```

### Using Base64 Audio

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { readFile } from 'fs/promises'

// Read audio file as base64
const audioBuffer = await readFile('recording.mp3')
const base64Audio = audioBuffer.toString('base64')

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: base64Audio,
})

console.log(result.text)
```

### Using Data URLs

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { base64AudioData } from './audio'

const dataUrl = `data:audio/mpeg;base64,${base64AudioData}`

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: dataUrl,
})
```

### Groq Transcription

Groq hosts Whisper large-v3 and large-v3-turbo on its fast inference stack. The `audio` input accepts a `File`, `Blob`, `ArrayBuffer`, base64 string, data URL, or an `https://` URL (which is forwarded to Groq without re-uploading).

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

// verbose_json is the default — segments carry segment-level start/end timestamps
for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s → ${segment.end}s] ${segment.text}`)
}
```

> **Note:** Groq supports `responseFormat` values `json`, `text`, and `verbose_json` (default). `srt` and `vtt` are not supported — passing them throws. Provider-specific `modelOptions` are `temperature` and `timestamp_granularities` (`['word']`, `['segment']`, or both).

### fal.ai Transcription

fal.ai offers Whisper, Wizper, and other STT models. The `audio` input accepts a URL, `File`, `Blob`, or `ArrayBuffer` (auto-wrapped in a `Blob`).

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

// Models that return word/chunk timestamps populate result.segments
for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s → ${segment.end}s] ${segment.text}`)
}
```

## Options

### Common Options

| Option | Type | Description |
|--------|------|-------------|
| `audio` | `File \| string` | Audio data (File object or base64 string) - required |
| `language` | `string` | Language code (e.g., "en", "es", "fr") |
| `prompt` | `string` | Optional prompt to guide transcription style or terms. Not supported with `gpt-4o-transcribe-diarize`. |
| `responseFormat` | `'json' \| 'text' \| 'srt' \| 'verbose_json' \| 'vtt'` | Common output format |

### Supported Languages

Whisper supports many languages. Common codes include:

| Code | Language |
|------|----------|
| `en` | English |
| `es` | Spanish |
| `fr` | French |
| `de` | German |
| `it` | Italian |
| `pt` | Portuguese |
| `ja` | Japanese |
| `ko` | Korean |
| `zh` | Chinese |
| `ru` | Russian |

> **Tip:** Providing the correct language code improves accuracy and reduces latency.

## Model Options

### OpenAI Model Options

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { audioFile } from './audio'

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile,
  responseFormat: 'verbose_json', // Top-level: detailed output with timestamps
  prompt: 'Technical terms: API, SDK, CLI', // Top-level: guide transcription
  modelOptions: {
    temperature: 0, // Lower = more deterministic (provider option)
    timestamp_granularities: ['word', 'segment'],
  },
})
```

| Option | Type | Description |
|--------|------|-------------|
| `temperature` | `number` | Sampling temperature (0 to 1) |
| `timestamp_granularities` | `Array<'word' \| 'segment'>` | Timestamp granularity to populate (`whisper-1` only; requires top-level `responseFormat: 'verbose_json'`) |
| `include` | `string[]` | Additional values to include in the response (e.g., `logprobs`) |
| `response_format` | `'json' \| 'text' \| 'srt' \| 'verbose_json' \| 'vtt' \| 'diarized_json'` | Raw OpenAI response format. Use `diarized_json` here for speaker-labeled diarization output. |
| `chunking_strategy` | `'auto' \| { type: 'server_vad', ... } \| null` | Audio chunking strategy (any model; unset transcribes the audio as a single block). Required by OpenAI for `gpt-4o-transcribe-diarize` inputs longer than 30 seconds — the adapter defaults it to `'auto'` for that model |
| `known_speaker_names` | `string[]` | Up to four speaker labels for diarization |
| `known_speaker_references` | `string[]` | 2-10 second data URL audio samples matching `known_speaker_names` |

> `responseFormat` and `prompt` are **top-level** options on `generateTranscription`, not `modelOptions` keys.

### Response Formats

| Format | Description |
|--------|-------------|
| `json` | Simple JSON with text |
| `text` | Plain text only |
| `srt` | SubRip subtitle format |
| `verbose_json` | Detailed JSON with timestamps and segments |
| `vtt` | WebVTT subtitle format |

OpenAI's `gpt-4o-transcribe-diarize` also supports `modelOptions.response_format: 'diarized_json'` for speaker-labeled segments.

### Speaker Diarization

Use `gpt-4o-transcribe-diarize` when you need speaker labels. When no response format is specified, TanStack AI defaults the request to `response_format: 'diarized_json'` and sends `chunking_strategy: 'auto'` unless you provide a chunking strategy yourself. Passing a top-level `responseFormat: 'json'` or `'text'` opts out of speaker segments.

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

OpenAI accepts up to four known speaker references; `known_speaker_names` and `known_speaker_references` must be provided together with matching lengths. The diarization model does not support `prompt`, `include`, or `timestamp_granularities`; the adapter rejects those combinations before making the API request.

## Response Format

The transcription result includes:

```typescript
interface TranscriptionResult {
  id: string           // Unique identifier
  model: string        // Model used
  text: string         // Full transcribed text
  language?: string    // Detected/specified language
  duration?: number    // Audio duration in seconds
  segments?: Array<{   // Timestamped segments
    id: number         // Segment identifier
    start: number      // Start time in seconds
    end: number        // End time in seconds
    text: string       // Segment text
    confidence?: number // Confidence score (0-1), if available
    speaker?: string    // Speaker identifier, if diarization is enabled
  }>
  words?: Array<{      // Word-level timestamps (top-level)
    word: string
    start: number
    end: number
  }>
}
```

## Complete Example

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { readFile } from 'fs/promises'

async function transcribeAudio(filepath: string) {
  // Read the audio file
  const audioBuffer = await readFile(filepath)
  const audioFile = new File(
    [audioBuffer], 
    filepath.split('/').pop()!, 
    { type: 'audio/mpeg' }
  )

  // Transcribe with detailed output
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
  console.log('Duration:', result.duration, 'seconds')
  
  // Print segments with timestamps
  if (result.segments) {
    for (const segment of result.segments) {
      console.log(`[${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s]: ${segment.text}`)
    }
  }

  return result
}

// Usage
await transcribeAudio('./meeting-recording.mp3')
```

## Model Availability

### OpenAI Models

| Model | Description | Use Case |
|-------|-------------|----------|
| `whisper-1` | Whisper large-v2 | General transcription |
| `gpt-4o-transcribe` | GPT-4o-based transcription | Higher accuracy |
| `gpt-4o-transcribe-diarize` | With speaker diarization | Multi-speaker audio |
| `gpt-4o-mini-transcribe` | Faster, lighter model | Cost-effective |

### Supported Audio Formats

OpenAI supports these audio formats:

- `mp3` - MPEG Audio Layer 3
- `mp4` - MPEG-4 Audio
- `mpeg` - MPEG Audio
- `mpga` - MPEG Audio
- `m4a` - MPEG-4 Audio
- `wav` - Waveform Audio
- `webm` - WebM Audio
- `flac` - Free Lossless Audio Codec
- `ogg` - Ogg Vorbis

> **Note:** Maximum file size is 25 MB.

## Browser Usage

### Recording and Transcribing

```typescript
async function recordAndTranscribe() {
  // Request microphone access
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mediaRecorder = new MediaRecorder(stream)
  const chunks: Blob[] = []

  mediaRecorder.ondataavailable = (e) => chunks.push(e.data)
  
  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(chunks, { type: 'audio/webm' })
    const audioFile = new File([audioBlob], 'recording.webm', { type: 'audio/webm' })
    
    // Send to your API endpoint for transcription
    const formData = new FormData()
    formData.append('audio', audioFile)
    
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData,
    })
    
    const result = await response.json()
    console.log('Transcription:', result.text)
  }

  // Start recording
  mediaRecorder.start()
  
  // Stop after 10 seconds
  setTimeout(() => mediaRecorder.stop(), 10000)
}
```

### Server API Endpoint

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

## Full-Stack Usage

TanStack AI provides React hooks and server-side streaming helpers to build full-stack audio transcription with minimal boilerplate.

### Streaming Mode (Server Route + Client Hook)

**Server** — Create an API route that wraps `generateTranscription` as a streaming response:

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

> **Note:** For browser-recorded audio, you'll typically send the audio as a base64 string in the JSON body. For file uploads, use a FormData-based endpoint instead (see [Browser Usage](#browser-usage) above).

**Client** — Use the `useTranscription` hook with a connection adapter:

```tsx
import { useTranscription, fetchServerSentEvents } from '@tanstack/ai-react'

function AudioTranscriber() {
  const { generate, result, isLoading, error } = useTranscription({
    connection: fetchServerSentEvents('/api/transcribe'),
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Convert to base64 for JSON transport
    const buffer = await file.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''),
    )
    const dataUrl = `data:${file.type};base64,${base64}`

    await generate({ audio: dataUrl, language: 'en' })
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

### Direct Mode (Server Function + Fetcher)

For non-streaming usage with TanStack Start server functions:

```typescript ignore
// lib/server-functions.ts
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
  // ... same UI as above
}
```

### Server Function Streaming (Fetcher + Response)

For TanStack Start server functions that stream results. The fetcher receives type-safe input and returns an SSE `Response` — the client parses it automatically:

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
        adapter: openaiTranscription('whisper-1'),
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

function AudioTranscriber() {
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
  // ... same UI as above
}
```

### Hook API

The `useTranscription` hook accepts:

| Option | Type | Description |
|--------|------|-------------|
| `connection` | `ConnectionAdapter` | Streaming transport (SSE, HTTP stream, custom) |
| `fetcher` | `(input) => Promise<TranscriptionResult \| Response>` | Direct async function, or server function returning an SSE `Response` |
| `onResult` | `(result) => TOutput \| null \| void` | Callback when transcription completes. Optionally return a transformed value to store as `result` |
| `onError` | `(error) => void` | Callback on error |
| `onProgress` | `(progress, message?) => void` | Progress updates (0-100) |

And returns:

| Property | Type | Description |
|----------|------|-------------|
| `generate` | `(input: TranscriptionGenerateInput) => Promise<void>` | Trigger transcription |
| `result` | `TranscriptionResult \| null` | The result with text and segments, or null |
| `isLoading` | `boolean` | Whether transcription is in progress |
| `error` | `Error \| undefined` | Current error, if any |
| `status` | `GenerationClientState` | `'idle'` \| `'generating'` \| `'success'` \| `'error'` |
| `stop` | `() => void` | Abort the current transcription |
| `reset` | `() => void` | Clear result, error, and return to idle |

## Error Handling

```typescript
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'
import { audioFile } from './audio'

try {
  const result = await generateTranscription({
    adapter: openaiTranscription('whisper-1'),
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

> **Debugging:** When a transcription returns garbage, empty segments, or the provider rejects your audio format, pass `debug: true` on `generateTranscription({...})` to log the outgoing request and every raw provider chunk. See [Debug Logging](../advanced/debug-logging).

## Environment Variables

The transcription adapter uses:

- `OPENAI_API_KEY`: Your OpenAI API key

## Explicit API Keys

```typescript
import { createOpenaiTranscription } from '@tanstack/ai-openai'

const adapter = createOpenaiTranscription('whisper-1', 'your-openai-api-key')
```

## Best Practices

1. **Audio Quality**: Better audio quality leads to more accurate transcriptions. Reduce background noise when possible.

2. **Language Specification**: Always specify the language if known—this improves accuracy and speed.

3. **File Size**: Keep audio files under 25 MB. For longer recordings, split into chunks.

4. **Format Selection**: MP3 offers a good balance of quality and size. Use WAV or FLAC for highest quality.

5. **Prompting**: Use the `prompt` option to provide context or expected vocabulary (e.g., technical terms, names).

6. **Timestamps**: Request `responseFormat: 'verbose_json'` and set `modelOptions.timestamp_granularities` when you need timing information for captions or synchronization.

7. **Diarization**: Use `gpt-4o-transcribe-diarize` with `modelOptions.response_format: 'diarized_json'` output for multi-speaker audio. Keep `chunking_strategy: 'auto'` unless you need custom VAD tuning.
