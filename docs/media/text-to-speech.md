---
title: Text-to-Speech
id: text-to-speech
order: 3
description: "Convert text to audio with generateSpeech() — OpenAI, Gemini, BytePlus Seed Speech, fal.ai."
keywords:
  - tanstack ai
  - text-to-speech
  - tts
  - generateSpeech
  - openai tts
  - voice synthesis
  - speech generation
---

# Text-to-Speech (TTS)

If you need spoken audio from text → `generateSpeech()`. For music/SFX → [Audio Generation](./audio-generation).

**Providers:** OpenAI TTS · Gemini Flash TTS · BytePlus Seed Speech · fal.ai (Kokoro, ElevenLabs, MiniMax, and more)

## Basic usage

### OpenAI

```typescript
import { generateSpeech } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

const result = await generateSpeech({
  adapter: openaiSpeech('tts-1'),
  text: 'Hello, welcome to TanStack AI!',
  voice: 'alloy',
})

console.log(result.format) // 'mp3'
console.log(result.contentType) // 'audio/mpeg'
// result.audio is base64
```

### Gemini

```typescript
import { generateSpeech } from '@tanstack/ai'
import { geminiSpeech } from '@tanstack/ai-gemini'

const result = await generateSpeech({
  adapter: geminiSpeech('gemini-3.1-flash-tts-preview'),
  text: 'Hello from Gemini TTS!',
})

console.log(result.audio)
```

### fal.ai

Pass model ID as a string literal for typed `modelOptions`.

```typescript
import { generateSpeech } from '@tanstack/ai'
import { falSpeech } from '@tanstack/ai-fal'

const result = await generateSpeech({
  adapter: falSpeech('fal-ai/gemini-3.1-flash-tts'),
  text: '[warm, enthusiastic] Welcome to TanStack AI!',
  voice: 'Kore',
})
```

```typescript
import { generateSpeech } from '@tanstack/ai'
import { falSpeech } from '@tanstack/ai-fal'

const result = await generateSpeech({
  adapter: falSpeech('fal-ai/kokoro/american-english'),
  text: 'Hello from fal!',
  voice: 'af_heart',
  speed: 1.0,
})
```

```typescript
import { generateSpeech } from '@tanstack/ai'
import { falSpeech } from '@tanstack/ai-fal'

const result = await generateSpeech({
  adapter: falSpeech('fal-ai/elevenlabs/tts/eleven-v3'),
  text: 'Welcome to TanStack AI.',
  voice: 'Rachel',
  modelOptions: { stability: 0.5 },
})
```

Top-level `voice` / `speed` map into model input; `modelOptions` is for model-only keys.

### BytePlus Seed Speech

Separate product from ModelArk — key is `BYTEPLUS_VOICE_API_KEY` (not `ARK_API_KEY`). Max **120s** output.

```typescript
import { generateSpeech } from '@tanstack/ai'
import { byteplusSpeech } from '@tanstack/ai-byteplus'

const result = await generateSpeech({
  adapter: byteplusSpeech('seed-audio-1.0'),
  text: 'Welcome to TanStack AI!',
  voice: 'en_female_stokie_uranus_bigtts',
  format: 'mp3',
})

console.log(result.contentType) // "audio/mpeg"
```

Formats: `wav`, `mp3`, `pcm`, `ogg_opus`. `modelOptions.enable_subtitle` → timings in **ms**; `duration` is in seconds.

Adapter sends `voice` as `references: [{ speaker }]`. Passing `modelOptions.references` **replaces** that array — include `speaker` yourself if you still want a stock voice. See [BytePlus adapter](../adapters/byteplus#text-to-speech-seed-speech).

## Options

| Option | Type | Description |
|--------|------|-------------|
| `text` | `string` | Required |
| `voice` | `string` | Voice id |
| `format` | `string` | e.g. `"mp3"`, `"wav"` |
| `speed` | `number` | OpenAI: 0.25–4.0 |

### OpenAI voices

`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`, `ash`, `ballad`, `coral`, `sage`, `verse`

### OpenAI formats

`mp3` (default) · `opus` · `aac` · `flac` · `wav` · `pcm`

## Play / save

### Browser

```typescript ignore
function playAudio(result: TTSResult) {
  const audioData = atob(result.audio)
  const bytes = new Uint8Array(audioData.length)
  for (let i = 0; i < audioData.length; i++) {
    bytes[i] = audioData.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: result.contentType })
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  audio.play()
  audio.onended = () => URL.revokeObjectURL(url)
}
```

### Node

```typescript ignore
import { generateSpeech } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'
import { writeFile } from 'fs/promises'

const result = await generateSpeech({
  adapter: openaiSpeech('tts-1'),
  text: 'Hello world!',
})

await writeFile('output.mp3', Buffer.from(result.audio, 'base64'))
```

## Full-stack

### 1. Server (SSE)

```typescript ignore
// routes/api/generate/speech.ts
import { generateSpeech, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/generate/speech')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json()
        const { text, voice, format, model } = body.data

        const stream = generateSpeech({
          adapter: openaiSpeech(model ?? 'tts-1'),
          text,
          voice,
          format,
          stream: true,
        })

        return toServerSentEventsResponse(stream)
      },
    },
  },
})
```

### 2. Client

```tsx
import { useGenerateSpeech, fetchServerSentEvents } from '@tanstack/ai-react'

function SpeechGenerator() {
  const { generate, result, isLoading, error } = useGenerateSpeech({
    connection: fetchServerSentEvents('/api/generate/speech'),
  })

  const playAudio = () => {
    if (!result) return
    const audioData = atob(result.audio)
    const bytes = new Uint8Array(audioData.length)
    for (let i = 0; i < audioData.length; i++) {
      bytes[i] = audioData.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: result.contentType })
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.play()
    audio.onended = () => URL.revokeObjectURL(url)
  }

  return (
    <div>
      <button
        onClick={() => generate({ text: 'Hello, welcome to TanStack AI!' })}
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate Speech'}
      </button>
      {error && <p>Error: {error.message}</p>}
      {result && <button onClick={playAudio}>Play Audio</button>}
    </div>
  )
}
```

Other transports: [Generations](./generations#transports-in-full). Full hook API: [Generation Hooks](./generation-hooks).

### Transform result to playable Audio

```tsx
import { useGenerateSpeech, fetchServerSentEvents } from '@tanstack/ai-react'
import type { TTSResult } from '@tanstack/ai'

function SpeechPlayer() {
  const { generate, result, isLoading } = useGenerateSpeech({
    connection: fetchServerSentEvents('/api/generate/speech'),
    onResult: (raw: TTSResult) => {
      const audioData = atob(raw.audio)
      const bytes = new Uint8Array(audioData.length)
      for (let i = 0; i < audioData.length; i++) {
        bytes[i] = audioData.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: raw.contentType })
      const url = URL.createObjectURL(blob)
      return { audio: new Audio(url), duration: raw.duration }
    },
  })

  return (
    <div>
      <button
        onClick={() => generate({ text: 'Hello world!', voice: 'alloy' })}
        disabled={isLoading}
      >
        Generate
      </button>
      {result && (
        <button onClick={() => result.audio.play()}>Play Audio</button>
      )}
    </div>
  )
}
```

`onResult`: non-null → replace; `null` → keep previous; `void` → store raw.

## Advanced

### Other transports

#### Direct

```typescript ignore
import { createServerFn } from '@tanstack/react-start'
import { generateSpeech } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

export const generateSpeechFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { text: string; voice?: string }) => data)
  .handler(async ({ data }) => {
    return generateSpeech({
      adapter: openaiSpeech('tts-1'),
      text: data.text,
      voice: data.voice,
    })
  })
```

```tsx
import { useGenerateSpeech } from '@tanstack/ai-react'
import { generateSpeechFn } from '../lib/server-functions'

function SpeechGenerator() {
  const { generate, result, isLoading } = useGenerateSpeech({
    fetcher: (input) => generateSpeechFn({ data: input }),
  })
}
```

#### Server function + SSE

```typescript ignore
import { createServerFn } from '@tanstack/react-start'
import { generateSpeech, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

export const generateSpeechStreamFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { text: string; voice?: string }) => data)
  .handler(({ data }) => {
    return toServerSentEventsResponse(
      generateSpeech({
        adapter: openaiSpeech('tts-1'),
        text: data.text,
        voice: data.voice,
        stream: true,
      }),
    )
  })
```

### OpenAI model options

```typescript
import { generateSpeech } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

const result = await generateSpeech({
  adapter: openaiSpeech('tts-1-hd'),
  text: 'High quality speech synthesis',
  voice: 'nova',
  format: 'mp3',
  speed: 1.0,
  modelOptions: {
    instructions: 'Speak in a calm, measured tone', // GPT-4o audio only
  },
})
```

`voice` / `format` / `speed` are top-level. `instructions` only on `gpt-4o-audio-preview`.

### Result / models

```typescript ignore
interface TTSResult {
  id: string
  model: string
  audio: string // base64
  format: string
  contentType: string
  duration?: number
}
```

| Model | Notes |
|-------|-------|
| `tts-1` | Fast, standard |
| `tts-1-hd` | Higher quality |
| `gpt-4o-audio-preview` | Advanced control |
| `gemini-2.5-flash-preview-tts` | Experimental |

### Errors / keys / practices

OpenAI max text length: 4096 chars. Debug with `debug: true` — [Debug Logging](../advanced/debug-logging).

Env: `OPENAI_API_KEY` · `GOOGLE_API_KEY` / `GEMINI_API_KEY` · `BYTEPLUS_VOICE_API_KEY`

```typescript
import { createOpenaiSpeech } from '@tanstack/ai-openai'
import { createGeminiSpeech } from '@tanstack/ai-gemini'

const openaiAdapter = createOpenaiSpeech('tts-1', 'your-openai-api-key')
const geminiAdapter = createGeminiSpeech(
  'gemini-3.1-flash-tts-preview',
  'your-google-api-key',
)
```

1. Split long text into chunks.
2. Prefer `mp3` generally; `opus` for streaming; `wav` for processing.
3. Cache generated audio.
4. Client triggers: [Generation Hooks](./generation-hooks).
