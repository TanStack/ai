---
title: Audio Generation
id: audio-generation
order: 15
---

# Audio Generation

TanStack AI's `generateAudio()` activity produces audio content — music, soundscapes, or sound effects — from a text prompt. It's distinct from [Text-to-Speech](./text-to-speech), which is optimized for spoken-word synthesis.

## Overview

Audio generation is handled by audio adapters that follow the same tree-shakeable architecture as other adapters in TanStack AI.

Currently supported:

- **Google Gemini**: Lyria 3 Pro and Lyria 3 Clip music generation
- **fal.ai**: MiniMax Music, DiffRhythm, Google Lyria 2, Stable Audio 2.5, MMAudio, ElevenLabs sound effects, Thinksound, and more

## Basic Usage

### Google Lyria (Music)

Google's Lyria models generate full-length songs with vocals and instrumentation. `lyria-3-pro-preview` handles multi-verse compositions, while `lyria-3-clip-preview` produces 30-second clips.

```typescript
import { generateAudio } from '@tanstack/ai'
import { geminiAudio } from '@tanstack/ai-gemini'

const result = await generateAudio({
  adapter: geminiAudio('lyria-3-pro-preview'),
  prompt: 'Uplifting indie pop with layered vocals and jangly guitars',
})

console.log(result.audio.url) // URL to the generated audio file
console.log(result.audio.contentType) // e.g. "audio/mpeg"
```

### fal.ai

fal.ai gives access to a broad catalogue of music, SFX, and general audio models through a single `falAudio` adapter.

#### Music Generation (MiniMax Music 2.6)

MiniMax's latest music model creates full compositions — vocals, backing music, and arrangements — from a single prompt.

```typescript
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/minimax-music/v2.6'),
  prompt: 'City Pop, 80s retro, groovy synth bass, warm female vocal, 104 BPM',
})

console.log(result.audio.url) // URL to the generated audio file
console.log(result.audio.contentType) // e.g. "audio/wav"
```

#### Music with Explicit Lyrics (DiffRhythm)

```typescript
const result = await generateAudio({
  adapter: falAudio('fal-ai/diffrhythm'),
  prompt: 'An upbeat electronic track with synths',
  modelOptions: {
    lyrics: '[verse]\nHello world\n[chorus]\nLa la la',
  },
})
```

#### Sound Effects

```typescript
const result = await generateAudio({
  adapter: falAudio('fal-ai/elevenlabs/sound-effects/v2'),
  prompt: 'Thunderclap followed by heavy rain',
  duration: 5,
})
```

#### MiniMax Music v2 (lyrics_prompt)

Earlier MiniMax variants use a `lyrics_prompt` field for lyric guidance.

```typescript
const result = await generateAudio({
  adapter: falAudio('fal-ai/minimax-music/v2'),
  prompt: 'A dreamy pop ballad in the style of the 80s',
  modelOptions: {
    lyrics_prompt: '[instrumental]',
  },
})
```

If a request doesn't return the audio you expected — a model silently truncates, a provider rejects a prompt, or the response shape looks off — pass `debug: true` to see every chunk the provider SDK emits. See [Debug Logging](../advanced/debug-logging).

## Options

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `AudioAdapter` | The adapter created via `falAudio()` (required) |
| `prompt` | `string` | Text description of the audio to generate (required) |
| `duration` | `number` | Desired duration in seconds (model-dependent) |
| `modelOptions` | `object` | Provider-specific options (fully typed when the model ID is passed as a string literal) |
| `debug` | `DebugOption` | Enable per-category debug logging (`true`, `false`, or a `DebugConfig` — see [Debug Logging](../advanced/debug-logging)) |

## Result Shape

```typescript
interface AudioGenerationResult {
  id: string
  model: string
  audio: {
    url?: string
    b64Json?: string
    contentType?: string
    duration?: number
  }
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
}
```

Gemini returns base64-encoded bytes in `result.audio.b64Json`. The fal adapter returns a URL in `result.audio.url` — if you need raw bytes, `fetch()` the URL yourself:

```typescript
const bytes = new Uint8Array(
  await (await fetch(result.audio.url!)).arrayBuffer()
)
```

## Client Hook (`useGenerateAudio`)

For client-side usage, framework integrations expose a `useGenerateAudio`
hook (or `createGenerateAudio` in Svelte) that wraps the same generation
flow. It mirrors the API of `useGenerateSpeech`, `useGenerateImage`, and
other media hooks — see [Generation Hooks](./generation-hooks) for the full
shape.

### Server (streaming SSE route)

```typescript
// routes/api/generate/audio.ts
import { generateAudio, toServerSentEventsResponse } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

export async function POST(req: Request) {
  const { prompt, duration } = await req.json()

  return toServerSentEventsResponse(
    generateAudio({
      adapter: falAudio('fal-ai/diffrhythm'),
      prompt,
      duration,
      stream: true,
    }),
  )
}
```

### Client (React)

```tsx
import { useGenerateAudio } from '@tanstack/ai-react'
import { fetchServerSentEvents } from '@tanstack/ai-client'

function AudioGenerator() {
  const { generate, result, isLoading, error, reset } = useGenerateAudio({
    connection: fetchServerSentEvents('/api/generate/audio'),
  })

  return (
    <div>
      <button
        onClick={() =>
          generate({ prompt: 'An upbeat electronic track', duration: 10 })
        }
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate'}
      </button>
      {error && <p>Error: {error.message}</p>}
      {result?.audio.url && <audio src={result.audio.url} controls />}
      {result && <button onClick={reset}>Clear</button>}
    </div>
  )
}
```

Use the `fetcher` option instead of `connection` when calling a TanStack
Start server function directly.

## Differences vs Text-to-Speech

| | `generateAudio()` | `generateSpeech()` |
|---|---|---|
| Purpose | Music, soundscapes, SFX | Spoken-word TTS |
| Result | `result.audio.url` or `result.audio.b64Json` | Base64 in `result.audio` |
| Primary input | `prompt` | `text` |
| Voice/speed controls | No | Yes (`voice`, `speed`) |

Use `generateSpeech()` when you want a spoken voice, and `generateAudio()` when you want non-speech audio.

## Environment Variables

Each provider reads its own API key from the environment by default:

```bash
GOOGLE_API_KEY=your-google-api-key
FAL_KEY=your-fal-api-key
```

Or pass it explicitly to the adapter:

```typescript
geminiAudio('lyria-3-pro-preview', { apiKey: 'your-key' })
falAudio('fal-ai/diffrhythm', { apiKey: 'your-key' })
```
