---
title: Audio Generation
id: audio-generation
order: 15
description: "Make music, soundscapes, and sound effects from a text prompt with generateAudio() and the useGenerateAudio hook. Works with Gemini Lyria and fal.ai models."
---

Your app needs a music track, a background soundscape, or a sound effect, made from a text prompt. `generateAudio()` sends the prompt to an audio model and gives you the audio back. The `useGenerateAudio` hook plays it in the browser.

For a spoken voice, use [Text-to-Speech](./text-to-speech) instead.

## Generate a track

You need a React app with a server route, and a fal.ai API key. This takes about 5 minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-fal

<!-- ::end:tabs -->

2. Put your key in `.env`:

```bash
FAL_KEY=your-fal-api-key
```

3. Add a `POST` route at `/api/generate/audio`:

```typescript
import {
  generateAudio,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

export async function POST(request: Request) {
  const { input } = await generationParamsFromRequest('audio', request)

  const stream = generateAudio({
    adapter: falAudio('fal-ai/minimax-music/v2.6'),
    prompt: input.prompt,
    duration: input.duration,
    stream: true,
  })
  return toServerSentEventsResponse(stream)
}
```

4. Call the route from a component:

```tsx
import { fetchServerSentEvents, useGenerateAudio } from '@tanstack/ai-react'

export function AudioGenerator() {
  const { generate, result, isLoading, error, reset } = useGenerateAudio({
    connection: fetchServerSentEvents('/api/generate/audio'),
  })

  const src = result?.audio.url
    ? result.audio.url
    : result?.audio.b64Json
      ? `data:${result.audio.contentType ?? 'audio/mpeg'};base64,${result.audio.b64Json}`
      : undefined

  return (
    <div>
      <button
        onClick={() =>
          generate({
            prompt: 'City Pop, 80s retro, groovy synth bass, warm female vocal, 104 BPM',
          })
        }
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Generate'}
      </button>
      {error && <p role="alert">{error.message}</p>}
      {src && <audio src={src} controls />}
      {result && <button onClick={reset}>Clear</button>}
    </div>
  )
}
```

Click **Generate**. When the track is ready, an audio player shows up.

## How it works

- `generateAudio()` sends the prompt to the model that the adapter names.
- The result has one `audio` object. It holds a `url` (fal) or base64 bytes in `b64Json` (Gemini), plus `contentType` when the provider sends it.
- With `stream: true`, the route sends the result to the hook as Server-Sent Events. The hook stores it on `result`.

To call a TanStack Start server function instead of a route, pass `fetcher` to the hook. See [Generations: Transports in full](./generations#transports-in-full). The hook options and return values are in [Generation Hooks](./generation-hooks#options).

> [!NOTE]
> A long track can outlive a page reload, and a fal URL expires. To keep the status, the result, and the audio file, add [Generation Persistence](../persistence/generation-persistence).

## Options

| Option | Type | Description |
| --- | --- | --- |
| `adapter` | `AudioAdapter` | The audio adapter and model (required) |
| `prompt` | `string` | What the audio sounds like (required) |
| `duration` | `number` | Length in seconds. Not every model uses it. |
| `modelOptions` | `object` | Model-specific options. Typed when you pass the model id as a string literal. |
| `debug` | `DebugOption` | Log every chunk from the provider SDK: `true`, `false`, or a `DebugConfig`. See [Debug Logging](../advanced/debug-logging). |

## Pick a provider

| Provider | Adapter | Package | Models | Key |
| --- | --- | --- | --- | --- |
| Google Gemini | `geminiAudio` | `@tanstack/ai-gemini` | `lyria-3-pro-preview`, `lyria-3-clip-preview` | `GOOGLE_API_KEY` |
| fal.ai | `falAudio` | `@tanstack/ai-fal` | MiniMax Music, DiffRhythm, Google Lyria 2, Stable Audio 2.5, MMAudio, ElevenLabs sound effects, Thinksound, and more | `FAL_KEY` |

### Google Lyria (music)

Lyria makes full songs with vocals and instruments:

- `lyria-3-pro-preview` makes compositions with several verses.
- `lyria-3-clip-preview` makes 30-second clips.

```typescript
import { generateAudio } from '@tanstack/ai'
import { geminiAudio } from '@tanstack/ai-gemini'

const result = await generateAudio({
  adapter: geminiAudio('lyria-3-pro-preview'),
  prompt: 'Uplifting indie pop with layered vocals and jangly guitars',
})

console.log(result.audio.b64Json) // base64 audio bytes
console.log(result.audio.contentType) // for example "audio/mpeg"
```

### fal.ai music (MiniMax Music 2.6)

MiniMax Music 2.6 makes a full song (vocals, backing music, and arrangement) from one prompt:

```typescript
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/minimax-music/v2.6'),
  prompt: 'City Pop, 80s retro, groovy synth bass, warm female vocal, 104 BPM',
})

console.log(result.audio.url) // URL of the audio file
console.log(result.audio.contentType) // for example "audio/wav"
```

### fal.ai music with your own lyrics (DiffRhythm)

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

### fal.ai sound effects

```typescript
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/elevenlabs/sound-effects/v2'),
  prompt: 'Thunderclap followed by heavy rain',
  duration: 5,
})
```

## Advanced

### MiniMax Music v2 lyrics

MiniMax Music v2 takes lyric guidance in the `lyrics_prompt` field:

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
  // Same TokenUsage shape as chat. Present when the provider reports it
  // (for example Gemini Lyria). fal sets `usage.billed` instead:
  // { quantity, unit: 'units' }, read from the `x-fal-billable-units`
  // result header. Multiply the quantity by the endpoint unit price
  // (from the fal pricing API) to get the exact cost.
  usage?: TokenUsage
}
```

An `audio` object holds either `url` or `b64Json`, never both. Gemini returns `b64Json`. fal returns `url`. To get raw bytes from a fal result, fetch the URL:

```typescript
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/diffrhythm'),
  prompt: 'An upbeat electronic track',
})

if (result.audio.url) {
  const response = await fetch(result.audio.url)
  const bytes = new Uint8Array(await response.arrayBuffer())
}
```

### Audio generation or text-to-speech

| | `generateAudio()` | `generateSpeech()` |
| --- | --- | --- |
| Purpose | Music, soundscapes, sound effects | Spoken words |
| Result | `result.audio.url` or `result.audio.b64Json` | Base64 in `result.audio` |
| Main input | `prompt` | `text` |
| Voice and speed controls | No | Yes (`voice`, `speed`) |

### Debug a request

If the audio is not what you expected, pass `debug: true`. Examples: the model cuts the track short, the provider rejects the prompt, or the response shape looks wrong. The adapter then logs every chunk that the provider SDK sends. See [Debug Logging](../advanced/debug-logging).

### API keys

Each provider reads its key from the environment by default:

```bash
GOOGLE_API_KEY=your-google-api-key
FAL_KEY=your-fal-api-key
```

To pass the key in code:

```typescript
import { createGeminiAudio } from '@tanstack/ai-gemini'
import { falAudio } from '@tanstack/ai-fal'

createGeminiAudio('lyria-3-pro-preview', 'your-key')
falAudio('fal-ai/diffrhythm', { apiKey: 'your-key' })
```

To let each user bring their own key, see the `useGenerateAudio` example in [Generation Hooks](./generation-hooks#usegenerateaudio).
