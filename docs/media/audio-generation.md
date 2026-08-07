---
title: Audio Generation
id: audio-generation
order: 15
description: "Generate music, soundscapes, and SFX with generateAudio() — Gemini Lyria and fal.ai models."
---

# Audio Generation

If you need music/SFX → `generateAudio()`. If you need spoken voice → [Text-to-Speech](./text-to-speech).

**Providers:** Gemini Lyria 3 Pro/Clip · fal.ai (MiniMax Music, DiffRhythm, Lyria 2, Stable Audio, ElevenLabs SFX, and more)

## Generate music (Gemini Lyria)

`lyria-3-pro-preview` = multi-verse songs. `lyria-3-clip-preview` = ~30s clips.

```typescript
import { generateAudio } from '@tanstack/ai'
import { geminiAudio } from '@tanstack/ai-gemini'

const result = await generateAudio({
  adapter: geminiAudio('lyria-3-pro-preview'),
  prompt: 'Uplifting indie pop with layered vocals and jangly guitars',
})

console.log(result.audio.b64Json) // base64 bytes (Gemini)
console.log(result.audio.contentType) // e.g. "audio/mpeg"
```

## Generate with fal.ai

### Music (MiniMax Music 2.6)

```typescript
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/minimax-music/v2.6'),
  prompt: 'City Pop, 80s retro, groovy synth bass, warm female vocal, 104 BPM',
})

console.log(result.audio.url)
console.log(result.audio.contentType) // e.g. "audio/wav"
```

### Music with lyrics (DiffRhythm)

```typescript
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/diffrhythm'),
  prompt: 'An upbeat electronic track with synths',
  modelOptions: {
    lyrics: '[verse]\nHello world\n[chorus]\nLa la la',
  },
})
```

### Sound effects

```typescript
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/elevenlabs/sound-effects/v2'),
  prompt: 'Thunderclap followed by heavy rain',
  duration: 5,
})
```

### MiniMax v2 (`lyrics_prompt`)

```typescript
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/minimax-music/v2'),
  prompt: 'A dreamy pop ballad in the style of the 80s',
  modelOptions: {
    lyrics_prompt: '[instrumental]',
  },
})
```

Unexpected output? Pass `debug: true`. See [Debug Logging](../advanced/debug-logging).

## Options

| Option | Type | Description |
|--------|------|-------------|
| `adapter` | `AudioAdapter` | Required — e.g. `falAudio()`, `geminiAudio()` |
| `prompt` | `string` | Required — text description of the audio |
| `duration` | `number` | Desired length in seconds (model-dependent) |
| `modelOptions` | `object` | Provider-specific options (typed from model ID literal) |
| `debug` | `DebugOption` | Per-category debug logging — see [Debug Logging](../advanced/debug-logging) |

## Full-stack: server + client

For long tracks across reloads, use [Generation Persistence](../persistence/generation-persistence).

### 1. Server (SSE route)

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

### 2. Client (React)

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

Use `fetcher` instead of `connection` when calling a TanStack Start server function. Full hook API: [Generation Hooks](./generation-hooks).

## Advanced

### Result shape

```typescript
import type { TokenUsage } from '@tanstack/ai'

interface AudioGenerationResult {
  id: string
  model: string
  audio: {
    url?: string
    b64Json?: string
    contentType?: string
    duration?: number
  }
  // Gemini Lyria may report TokenUsage. fal surfaces usage.unitsBilled
  // from x-fal-billable-units — multiply by endpoint unit price for cost.
  usage?: TokenUsage
}
```

Gemini → `result.audio.b64Json`. fal → `result.audio.url`. Fetch bytes from a fal URL:

```typescript
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/diffrhythm'),
  prompt: 'An upbeat electronic track',
})

const bytes = new Uint8Array(
  await (await fetch(result.audio.url!)).arrayBuffer(),
)
```

### vs Text-to-Speech

| | `generateAudio()` | `generateSpeech()` |
|---|---|---|
| Purpose | Music, soundscapes, SFX | Spoken-word TTS |
| Result | `result.audio.url` or `b64Json` | Base64 in `result.audio` |
| Primary input | `prompt` | `text` |
| Voice/speed | No | Yes (`voice`, `speed`) |

### API keys

```bash
GOOGLE_API_KEY=your-google-api-key
FAL_KEY=your-fal-api-key
```

Or pass explicitly:

```typescript
import { createGeminiAudio } from '@tanstack/ai-gemini'
import { falAudio } from '@tanstack/ai-fal'

createGeminiAudio('lyria-3-pro-preview', 'your-key')
falAudio('fal-ai/diffrhythm', { apiKey: 'your-key' })
```
