---
title: Sound Effects
id: sound-effects-generation
order: 16
---

# Sound Effects

TanStack AI's `generateSoundEffects()` activity produces short, non-musical audio from a text prompt — things like ambience, foley, explosions, and UI sounds. It's distinct from [Music Generation](./music-generation) (compositions with melody/harmony) and [Text-to-Speech](./text-to-speech) (spoken-word synthesis).

## Overview

Currently supported:

- **fal.ai**: ElevenLabs Sound Effects v2, MMAudio v2 (text-to-audio), Thinksound, and related models

## Basic Usage

```typescript
import { generateSoundEffects } from '@tanstack/ai'
import { falSoundEffects } from '@tanstack/ai-fal'

const result = await generateSoundEffects({
  adapter: falSoundEffects('fal-ai/elevenlabs/sound-effects/v2'),
  prompt: 'Thunderclap followed by heavy rain',
  duration: 5,
})

console.log(result.audio.url) // URL to the generated audio
console.log(result.audio.contentType) // e.g. "audio/wav"
```

## Options

| Option         | Type                  | Description                                                                                  |
| -------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `adapter`      | `SoundEffectsAdapter` | The adapter created via `falSoundEffects()` (required)                                       |
| `prompt`       | `string`              | Text description of the sound to generate (required)                                         |
| `duration`     | `number`              | Desired duration in seconds (model-dependent)                                                |
| `modelOptions` | `object`              | Provider-specific options (fully typed when the model ID is passed as a string literal)      |

## Result Shape

```typescript
interface SoundEffectsGenerationResult {
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

The fal adapter returns a URL in `result.audio.url` — if you need raw bytes, `fetch()` the URL yourself:

```typescript
const bytes = new Uint8Array(
  await (await fetch(result.audio.url!)).arrayBuffer(),
)
```

## Environment Variables

```bash
FAL_KEY=your-fal-api-key
```

Or pass it explicitly:

```typescript
falSoundEffects('fal-ai/elevenlabs/sound-effects/v2', { apiKey: 'your-key' })
```
