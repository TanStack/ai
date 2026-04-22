---
title: Music Generation
id: music-generation
order: 15
---

# Music Generation

TanStack AI's `generateMusic()` activity produces musical compositions from a text prompt — melodies, backing tracks, and full songs with vocals. It's distinct from [Text-to-Speech](./text-to-speech) (spoken-word synthesis) and [Sound Effects](./sound-effects-generation) (short non-musical audio).

## Overview

Music generation is handled by music adapters that follow the same tree-shakeable architecture as other adapters in TanStack AI.

Currently supported:

- **Google Gemini**: Lyria 3 Pro and Lyria 3 Clip
- **fal.ai**: MiniMax Music, DiffRhythm, Google Lyria 2, Stable Audio 2.5, ACE-Step, YuE, and more

## Basic Usage

### Google Lyria

Google's Lyria models generate full-length songs with vocals and instrumentation. `lyria-3-pro-preview` handles multi-verse compositions, while `lyria-3-clip-preview` produces 30-second clips.

```typescript
import { generateMusic } from '@tanstack/ai'
import { geminiMusic } from '@tanstack/ai-gemini'

const result = await generateMusic({
  adapter: geminiMusic('lyria-3-pro-preview'),
  prompt: 'Uplifting indie pop with layered vocals and jangly guitars',
})

console.log(result.audio.b64Json) // base64-encoded audio
console.log(result.audio.contentType) // e.g. "audio/mpeg"
```

### fal.ai

fal.ai gives access to a broad catalogue of music models through the `falMusic` adapter.

#### MiniMax Music 2.6

MiniMax's latest music model creates full compositions — vocals, backing music, and arrangements — from a single prompt.

```typescript
import { generateMusic } from '@tanstack/ai'
import { falMusic } from '@tanstack/ai-fal'

const result = await generateMusic({
  adapter: falMusic('fal-ai/minimax-music/v2.6'),
  prompt: 'City Pop, 80s retro, groovy synth bass, warm female vocal, 104 BPM',
})

console.log(result.audio.url) // URL to the generated audio file
console.log(result.audio.contentType) // e.g. "audio/wav"
```

#### DiffRhythm (explicit lyrics)

```typescript
const result = await generateMusic({
  adapter: falMusic('fal-ai/diffrhythm'),
  prompt: 'An upbeat electronic track with synths',
  modelOptions: {
    lyrics: '[verse]\nHello world\n[chorus]\nLa la la',
  },
})
```

#### MiniMax Music v2 (`lyrics_prompt`)

Earlier MiniMax variants use a `lyrics_prompt` field for lyric guidance.

```typescript
const result = await generateMusic({
  adapter: falMusic('fal-ai/minimax-music/v2'),
  prompt: 'A dreamy pop ballad in the style of the 80s',
  modelOptions: {
    lyrics_prompt: '[instrumental]',
  },
})
```

## Options

| Option         | Type           | Description                                                                                 |
| -------------- | -------------- | ------------------------------------------------------------------------------------------- |
| `adapter`      | `MusicAdapter` | The adapter created via `falMusic()` or `geminiMusic()` (required)                          |
| `prompt`       | `string`       | Text description of the music to generate (required)                                        |
| `duration`     | `number`       | Desired duration in seconds (model-dependent)                                               |
| `modelOptions` | `object`       | Provider-specific options (fully typed when the model ID is passed as a string literal) |

## Result Shape

```typescript
interface MusicGenerationResult {
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
  await (await fetch(result.audio.url!)).arrayBuffer(),
)
```

## Differences vs Text-to-Speech and Sound Effects

|                       | `generateMusic()`      | `generateSpeech()`      | `generateSoundEffects()`  |
| --------------------- | ---------------------- | ----------------------- | ------------------------- |
| Purpose               | Musical compositions   | Spoken-word TTS         | Short non-musical sounds  |
| Result                | `url` / `b64Json`      | Base64 in `result.audio` | `url` / `b64Json`         |
| Primary input         | `prompt`               | `text`                  | `prompt`                  |
| Voice/speed controls  | No                     | Yes (`voice`, `speed`)  | No                        |

## Environment Variables

Each provider reads its own API key from the environment by default:

```bash
GOOGLE_API_KEY=your-google-api-key
FAL_KEY=your-fal-api-key
```

Or pass it explicitly to the adapter:

```typescript
geminiMusic('lyria-3-pro-preview', { apiKey: 'your-key' })
falMusic('fal-ai/diffrhythm', { apiKey: 'your-key' })
```
