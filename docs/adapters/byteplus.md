---
title: BytePlus
id: byteplus-adapter
order: 8
description: "BytePlus ModelArk — Seed chat, Seedance video, Seedream image, Seed Speech TTS/ASR via @tanstack/ai-byteplus."
keywords:
  - tanstack ai
  - byteplus
  - modelark
  - ark
  - seed
  - seedance
  - seedream
  - seed speech
  - bytedance
  - video generation
  - image generation
  - text to speech
  - transcription
  - adapter
---

If you need BytePlus models → install, set the right key, call the matching factory.

## Install

```bash
npm install @tanstack/ai-byteplus
```

## Two products, two keys

| Adapters | Product | Env var | Auth |
| --- | --- | --- | --- |
| `byteplusText`, `byteplusVideo`, `byteplusImage` | ModelArk | `ARK_API_KEY` (fallback `BYTEPLUS_API_KEY`) | `Authorization: Bearer` |
| `byteplusSpeech`, `byteplusTranscription` | Seed Speech | `BYTEPLUS_VOICE_API_KEY` | `X-Api-Key` |

```bash
ARK_API_KEY=...
BYTEPLUS_VOICE_API_KEY=...
```

Passing an Ark key to speech → `45000010 Invalid X-Api-Key`.

Ark keys are **region-isolated**. Default base: `https://ark.ap-southeast.bytepluses.com/api/v3`. Override with `baseURL`:

```typescript
import { createBytePlusText } from '@tanstack/ai-byteplus'
import { arkApiKey } from './config'

const adapter = createBytePlusText('dola-seed-2-1-turbo-260628', arkApiKey, {
  baseURL: 'https://ark.eu-west.bytepluses.com/api/v3',
})
```

EU serves chat + image only — Seedance is Asia-Pacific only.

## Chat

**Server:**

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { byteplusText } from '@tanstack/ai-byteplus'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: byteplusText('dola-seed-2-1-turbo-260628'),
    messages,
  })

  return toServerSentEventsResponse(stream)
}
```

**Client:**

```tsx
import { useState } from 'react'
import { fetchServerSentEvents, useChat } from '@tanstack/ai-react'

export function Chat() {
  const [input, setInput] = useState('')

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })

  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          <strong>{message.role}</strong>
          {message.parts.map((part, index) =>
            part.type === 'text' ? <p key={index}>{part.content}</p> : null,
          )}
        </div>
      ))}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!input.trim() || isLoading) return
          sendMessage(input)
          setInput('')
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  )
}
```

### Model options

OpenAI-compatible snake_case in `modelOptions`, plus Ark: `thinking`, `reasoning_effort`, `repetition_penalty`, `service_tier`.

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { byteplusText } from '@tanstack/ai-byteplus'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: byteplusText('dola-seed-2-1-turbo-260628'),
    messages,
    modelOptions: {
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 2048,
      thinking: { type: 'enabled' },
      reasoning_effort: 'medium',
    },
  })

  return toServerSentEventsResponse(stream)
}
```

**Must not combine:**

- `max_tokens` + `max_completion_tokens`
- `reasoning_effort` + `thinking: { type: 'disabled' }`

`service_tier: 'flex'` → cheaper offline batch queue.

### Reasoning / `encrypted_content`

Seed reasons by default (`reasoning_content` deltas). Disable:

```typescript
import { chat } from '@tanstack/ai'
import { byteplusText } from '@tanstack/ai-byteplus'

chat({
  adapter: byteplusText('seed-1-8-251228'),
  messages: [{ role: 'user', content: 'Hello' }],
  modelOptions: { thinking: { type: 'disabled' } },
})
```

`disabled` everywhere; `auto` only on `gpt-oss-120b-250805`. `deepseek-v3-2-251201` defaults reasoning *off*.

Thinking-summary models (`dola-seed-2-1-turbo-260628`, `seed-2-0-lite-260428`, `seed-2-0-mini-260428`, `seed-2-0-pro-260328`) emit `encrypted_content`. **Adapter round-trips it** as reasoning `signature`. If you persist history, keep thinking parts' `signature` for cache hits (omitting is non-fatal). Structured-output turns skip the blob (lost cache hit only).

### Structured output

Ten models accept `json_schema`. Use `dola-seed-2-1-turbo-260628` or `seed-2-0-lite-260228` — **not** `seed-2-0-lite-260428` (rejects schema). `glm-4-7-251222` ignores schemas (excluded). Unsupported models throw / emit `RUN_ERROR`. Export: `BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS`.

```typescript
import { chat } from '@tanstack/ai'
import { byteplusText } from '@tanstack/ai-byteplus'
import { z } from 'zod'

const RecipeSchema = z.object({
  name: z.string().meta({ description: 'Name of the dish' }),
  minutes: z.number().meta({ description: 'Total cooking time in minutes' }),
  ingredients: z.array(z.string()),
})

const recipe = await chat({
  adapter: byteplusText('dola-seed-2-1-turbo-260628'),
  messages: [{ role: 'user', content: 'Give me a recipe for carbonara' }],
  outputSchema: RecipeSchema,
})

console.log(recipe.name, recipe.minutes)
```

## Video (Seedance)

> [Experimental](../media/video-generation). URLs expire 24h after complete — [keep files](../persistence/keep-generated-files).

```typescript
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { byteplusVideo } from '@tanstack/ai-byteplus'

const adapter = byteplusVideo('dreamina-seedance-2-0-260128')

const { jobId } = await generateVideo({
  adapter,
  prompt: 'a guitar being played in a store',
  size: '16:9_720p',
  duration: 5,
})

let status = await getVideoJobStatus({ adapter, jobId })
while (status.status === 'pending' || status.status === 'processing') {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  status = await getVideoJobStatus({ adapter, jobId })
}

console.log(status.status === 'completed' ? status.url : status.error)
```

`size`: ratio or `ratio_resolution` (`'16:9'`, `'16:9_720p'`). Ratios: `16:9`, `9:16`, `4:3`, `3:4`, `1:1`, `21:9`, `adaptive`.

### Client lifecycle

**Server** (`stream: true`):

```typescript
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { byteplusVideo } from '@tanstack/ai-byteplus'

export async function POST(request: Request) {
  const { prompt } = await request.json()

  const stream = generateVideo({
    adapter: byteplusVideo('dreamina-seedance-2-0-260128'),
    prompt,
    size: '16:9_720p',
    duration: 5,
    stream: true,
    pollingInterval: 5000,
  })

  return toServerSentEventsResponse(stream)
}
```

**Client:**

```tsx
import { fetchServerSentEvents, useGenerateVideo } from '@tanstack/ai-react'

export function SeedanceGenerator() {
  const { generate, result, videoStatus, isLoading, error } = useGenerateVideo({
    connection: fetchServerSentEvents('/api/generate/video'),
  })

  return (
    <div>
      <button
        onClick={() => generate({ prompt: 'a guitar being played in a store' })}
        disabled={isLoading}
      >
        {isLoading ? 'Generating…' : 'Generate video'}
      </button>

      {isLoading && <p>Status: {videoStatus?.status ?? 'starting…'}</p>}
      {error && <p>Error: {error.message}</p>}
      {result && <video src={result.url} controls width={640} />}
    </div>
  )
}
```

### Per-model options

Ark **400s** on inapplicable fields:

| Option | Models |
| --- | --- |
| `service_tier`, `camera_fixed` | Seedance 1.x only |
| `frames` (`25 + 4n` in `[29, 289]`) | `seedance-1-0-pro-250528`, `seedance-1-0-pro-fast-251015` |
| `draft` | `seedance-1-5-pro-251215` only |
| `priority` (`0`–`9`) | `dreamina-seedance-2-0-*` |
| `duration: -1` | Seedance 2.0 + `seedance-1-5-pro-251215` |
| `seed`, `watermark`, `generate_audio`, `return_last_frame`, `callback_url` | all |

`watermark` defaults `false` for video. No 2K tier; `4k` only on `dreamina-seedance-2-0-260128`. Reference roles: [video-generation](../media/video-generation#role-hints).

### Seedance 2.5

Id `dreamina-seedance-2-5-260628` is activation-gated (`404 ModelNotOpen` until enabled). Untyped but usable as any string — local guards relax. Typed tables lag until capabilities are probeable.

```typescript
import { generateVideo } from '@tanstack/ai'
import { byteplusVideo } from '@tanstack/ai-byteplus'

const { jobId } = await generateVideo({
  adapter: byteplusVideo('dreamina-seedance-2-5-260628'),
  prompt: 'a guitar being played in a store',
  size: '16:9_720p',
  duration: 5,
})
```

Also on [fal](./fal) — this adapter is direct BytePlus billing + full Seedance fields.

## Image (Seedream)

```typescript
import { generateImage } from '@tanstack/ai'
import { byteplusImage } from '@tanstack/ai-byteplus'

const result = await generateImage({
  adapter: byteplusImage('dola-seedream-5-0-pro-260628'),
  prompt: 'a guitar being played in a store',
  size: '2K',
  modelOptions: { watermark: false },
})

console.log(result.images[0]?.url)
```

`size`: token (`1K`/`2K`/`4K`) **or** pixels (`2048x2048`) — never mix. Edit with image parts (up to 14 refs; 10 on pro):

```typescript
import { generateImage } from '@tanstack/ai'
import { byteplusImage } from '@tanstack/ai-byteplus'

const result = await generateImage({
  adapter: byteplusImage('seedream-5-0-260128'),
  prompt: [
    { type: 'text', content: 'Put this guitar on a concert stage' },
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/guitar.png' },
    },
  ],
})
```

**Footguns:** `watermark` defaults **true**. `numberOfImages` is an upper bound (group mode), not a guarantee. URLs expire 24h; use `response_format: 'b64_json'` for bytes.

## Text-to-speech

Uses `BYTEPLUS_VOICE_API_KEY`.

```typescript
import { generateSpeech } from '@tanstack/ai'
import { byteplusSpeech } from '@tanstack/ai-byteplus'

const result = await generateSpeech({
  adapter: byteplusSpeech('seed-audio-1.0'),
  text: 'welcome to the guitar store',
  voice: 'en_female_stokie_uranus_bigtts',
  format: 'mp3',
})

console.log(result.contentType, result.audio.length)
```

`voice` maps to `references: [{ speaker }]`. Passing `modelOptions.references` **replaces** that — include `speaker` yourself if cloning + stock voice.

Voice suffixes: `_uranus_bigtts` (TTS 2.0), `_mars_bigtts`/`_moon_bigtts` (1.0), `*_emo_v2_*` (emotion). Formats: `wav`, `mp3`, `pcm`, `ogg_opus`. Cap: 120s `originalDuration`. Subtitle times in ms; duration in seconds. Result `url` ~2h.

```typescript
import { generateSpeech } from '@tanstack/ai'
import { byteplusSpeech, type BytePlusTTSResult } from '@tanstack/ai-byteplus'

const result: BytePlusTTSResult = await generateSpeech({
  adapter: byteplusSpeech('seed-audio-1.0'),
  text: 'welcome to the guitar store',
  modelOptions: {
    format: 'ogg_opus',
    sample_rate: 48000,
    speech_rate: 20,
    enable_subtitle: true,
  },
})

for (const sentence of result.subtitle?.sentences ?? []) {
  console.log(sentence.text, sentence.start_time)
}
```

## Transcription

```typescript
import { generateTranscription } from '@tanstack/ai'
import { byteplusTranscription } from '@tanstack/ai-byteplus'
import { audioFile } from './audio'

const result = await generateTranscription({
  adapter: byteplusTranscription('seed-asr'),
  audio: audioFile,
  modelOptions: { enable_punc: true, enable_speaker_info: true },
})

console.log(result.text)
for (const segment of result.segments ?? []) {
  console.log(segment.speaker, segment.text)
}
```

Audio: `File` / base64 / data URL / public URL; up to 2h, 100 MB. Flags: `enable_itn`, `enable_punc`, `enable_ddc`, `enable_speaker_info`.

## Models

Exports: `BYTEPLUS_CHAT_MODELS`, `BYTEPLUS_VIDEO_MODELS`, `BYTEPLUS_IMAGE_MODELS`, `BYTEPLUS_TTS_MODELS`, `BYTEPLUS_TRANSCRIPTION_MODELS`.

**Must (chat):** `dola-seed-2-1-turbo-260628`, `seed-2-0-lite-260428`, `seed-2-0-mini-260428`, `seed-2-0-pro-260328`, `seed-2-0-lite-260228`, `seed-2-0-mini-260215`, `seed-2-0-code-preview-260328`, `seed-1-8-251228`, `seed-1-6-250915`, `seed-1-6-250615`, `seed-1-6-flash-250715`, `seed-1-6-flash-250615`, `glm-5-2-260617`, `glm-4-7-251222`, `deepseek-v4-pro-260425`, `deepseek-v4-flash-260425`, `deepseek-v3-2-251201`, `gpt-oss-120b-250805`.

**Video:** `dreamina-seedance-2-0-260128`, `dreamina-seedance-2-0-fast-260128`, `dreamina-seedance-2-0-mini-260615`, `seedance-1-5-pro-251215`, `seedance-1-0-pro-250528`, `seedance-1-0-pro-fast-251015` (+ untyped 2.5).

**Image:** `dola-seedream-5-0-pro-260628`, `seedream-5-0-260128`, `seedream-5-0-lite-260128`, `seedream-4-5-251128`, `seedream-4-0-250828`.

**Speech:** `seed-audio-1.0`, `seed-asr`.

## API reference

| Factory | Env key |
| --- | --- |
| `byteplusText` / `createBytePlusText` | `ARK_API_KEY` |
| `byteplusVideo` / `createBytePlusVideo` | `ARK_API_KEY` |
| `byteplusImage` / `createBytePlusImage` | `ARK_API_KEY` |
| `byteplusSpeech` / `createBytePlusSpeech` | `BYTEPLUS_VOICE_API_KEY` |
| `byteplusTranscription` / `createBytePlusTranscription` | `BYTEPLUS_VOICE_API_KEY` |

No provider-tool factories — use `toolDefinition()` ([tools](../tools/tools.md)).

## Next steps

- [Video Generation](../media/video-generation)
- [Image Generation](../media/image-generation)
- [Structured Outputs](../structured-outputs/one-shot)
- [Other Adapters](./openai)
