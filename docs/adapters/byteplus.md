---
title: BytePlus
id: byteplus-adapter
order: 8
description: "Use BytePlus ModelArk with TanStack AI — Seed chat models with reasoning, Seedance video generation, Seedream image generation, and Seed Speech text-to-speech and transcription via @tanstack/ai-byteplus."
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

The BytePlus adapter connects TanStack AI to [BytePlus](https://www.byteplus.com/), ByteDance's international model platform, across four generation kinds:

- **Chat** — the Seed model family (plus GLM, DeepSeek and gpt-oss) on ModelArk's OpenAI-compatible `/chat/completions` endpoint, with reasoning on by default.
- **Video** — Seedance, an asynchronous task API.
- **Image** — Seedream.
- **Speech** — Seed Speech text-to-speech and transcription, which live on a **different host with a different API key** (see [Two products, two keys](#two-products-two-keys)).

## Installation

```bash
npm install @tanstack/ai-byteplus
# or
pnpm add @tanstack/ai-byteplus
# or
yarn add @tanstack/ai-byteplus
```

## Two products, two keys

BytePlus splits these models across two products, and they do not share credentials:

| Adapters | Product | Env var | Auth header |
| --- | --- | --- | --- |
| `byteplusText`, `byteplusVideo`, `byteplusImage` | ModelArk (Ark) | `ARK_API_KEY` (falls back to `BYTEPLUS_API_KEY`) | `Authorization: Bearer` |
| `byteplusSpeech`, `byteplusTranscription` | Seed Speech | `BYTEPLUS_VOICE_API_KEY` | `X-Api-Key` |

```bash
# ModelArk: chat, Seedance video, Seedream image
ARK_API_KEY=...

# Seed Speech: TTS and transcription — a separate product key
BYTEPLUS_VOICE_API_KEY=...
```

Passing an Ark key to the speech adapters fails with `45000010 Invalid X-Api-Key`.

Ark keys are also **region-isolated**: the default base URL is the Asia-Pacific south-east endpoint (`https://ark.ap-southeast.bytepluses.com/api/v3`), and a key issued for one region will not authenticate against another. Point the adapter elsewhere with `baseURL`:

```typescript
import { createBytePlusText } from '@tanstack/ai-byteplus'
import { arkApiKey } from './config'

const adapter = createBytePlusText('dola-seed-2-1-turbo-260628', arkApiKey, {
  baseURL: 'https://ark.eu-west.bytepluses.com/api/v3',
})
```

Per the BytePlus docs the EU endpoint serves chat and image only — Seedance video is Asia-Pacific only.

## Chat

The adapter carries the model, so there is no separate `model` option.

**Server** — an endpoint that streams the reply back over SSE:

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

**Client** — the same `useChat` hook as every other provider:

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

Ark's chat endpoint is OpenAI-compatible, so sampling parameters keep their OpenAI snake_case names and live in `modelOptions`. `thinking`, `reasoning_effort`, `repetition_penalty` and `service_tier` are the Ark-only additions:

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

Two constraints the type system can't express, both live-verified as `400`s:

- `max_tokens` and `max_completion_tokens` are mutually exclusive.
- `reasoning_effort` cannot be combined with `thinking: { type: 'disabled' }`.

`service_tier: 'flex'` routes the request to the cheaper offline batch queue with no latency guarantee.

## Reasoning and `encrypted_content`

Seed models reason by default. Reasoning arrives as its own stream of `reasoning_content` deltas and is surfaced as reasoning content rather than answer text, so `useChat` renders it separately from the reply. Turn it off per request:

```typescript
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { byteplusText } from '@tanstack/ai-byteplus'

export async function POST(request: Request) {
  const { messages } = await request.json()

  const stream = chat({
    adapter: byteplusText('dola-seed-2-1-turbo-260628'),
    messages,
    modelOptions: { thinking: { type: 'disabled' } },
  })

  return toServerSentEventsResponse(stream)
}
```

`disabled` works everywhere; `auto` is accepted only by `gpt-oss-120b-250805`. `deepseek-v3-2-251201` is the one model that defaults to reasoning *off*.

The four "thinking summary" models — `dola-seed-2-1-turbo-260628`, `seed-2-0-lite-260428`, `seed-2-0-mini-260428` and `seed-2-0-pro-260328` — also emit an opaque `encrypted_content` blob alongside the reasoning trace. It is a signature over that trace, and BytePlus's docs ask for it back verbatim on the assistant message in the next turn.

**The adapter round-trips it for you**, over the same seam Anthropic's thinking signatures use: the blob is captured off the stream and attached to the reasoning step as its `signature`, which lands on the thinking part of the assistant message and is echoed back on the next request. Two consequences worth knowing:

- If you persist and replay conversation history yourself, keep the thinking parts' `signature` — dropping it costs you the reasoning-cache hit. It is not fatal: a live probe confirmed Ark accepts a turn whose assistant message omits `encrypted_content`.
- A structured-output turn doesn't capture the blob, for the same reason — again a lost cache hit, not a failed request.

## Structured output

Ten of the eighteen chat models accept `response_format: { type: 'json_schema' }`:

`dola-seed-2-1-turbo-260628`, `seed-2-0-pro-260328`, `seed-2-0-lite-260228`, `seed-2-0-mini-260215`, `seed-1-8-251228`, `seed-1-6-250915`, `seed-1-6-250615`, `seed-1-6-flash-250715`, `seed-1-6-flash-250615`, `glm-5-2-260617`.

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

On the other eight models the adapter **fails loudly** rather than degrading: `chat({ outputSchema })` throws, and the streaming form emits a `RUN_ERROR` naming the models that do work. There is no JSON-mode fallback to fall back *to* — Ark rejects `response_format: { type: 'json_object' }` on every one of them too.

Two traps worth knowing, both found by probing the live API rather than reading the tables:

- **The published capability tables are wrong in both directions.** `seed-2-0-lite-260428` — the obvious default model — is one of the eight that reject a JSON schema. Reach for `seed-2-0-lite-260228` or `dola-seed-2-1-turbo-260628` when you need typed output.
- **`glm-4-7-251222` accepts a schema and then ignores it**, answering in prose with a `200`. It is deliberately excluded from the supported list, so the adapter rejects it up front instead of handing you unparseable output.

`BYTEPLUS_STRUCTURED_OUTPUT_CHAT_MODELS` is exported if you want to gate a model picker on it.

## Video generation (Seedance)

> Video generation is an [experimental feature](../media/video-generation).

Seedance is an asynchronous task API: `generateVideo()` opens the job and returns a `jobId`, and the video URL arrives with the terminal status.

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

**Generated video URLs expire 24 hours after the task completes** (the task record itself is kept for seven days), so download anything you intend to keep — see [Keeping generated files](../persistence/keep-generated-files).

`size` is a `ratio` or `ratio_resolution` template (`'16:9'`, `'16:9_720p'`). Ratios are `16:9`, `9:16`, `4:3`, `3:4`, `1:1`, `21:9` and `adaptive`.

### Driving the whole lifecycle from the client

**Server** — hand the polling to the core with `stream: true` and pipe the chunks out:

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

**Client** — `useGenerateVideo` tracks the job for you:

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

Seedance options are model-specific, and **Ark rejects an inapplicable field with a `400` rather than ignoring it** — "the specified parameter `draft` is not supported for model seedance-1-0-pro in t2v, must be empty". The applicable set:

| Option | Models that accept it |
| --- | --- |
| `service_tier` (`'default'` \| `'flex'`) | Seedance 1.x only — the 2.0 family rejects it |
| `camera_fixed` | Seedance 1.x only |
| `frames` (fractional-second output, `25 + 4n` in `[29, 289]`) | `seedance-1-0-pro-250528`, `seedance-1-0-pro-fast-251015` |
| `draft` (cheap low-fidelity preview) | `seedance-1-5-pro-251215` only |
| `priority` (`0`–`9`) | the `dreamina-seedance-2-0-*` family only |
| `duration: -1` (model picks the length) | Seedance 2.0 and `seedance-1-5-pro-251215` |
| `seed`, `watermark`, `generate_audio`, `return_last_frame`, `callback_url` | every model |

`watermark` defaults to `false` for video (the opposite of Seedream images). `generate_audio` is accepted everywhere but only Seedance 2.0 and 1.5-pro actually produce an audio track.

Resolutions are per model too, and the shipped table comes from live probes rather than the published docs: there is **no 2K tier on any Seedance model**, `4k` exists only on `dreamina-seedance-2-0-260128`, and `seedance-1-0-pro-fast-251015` does accept `1080p` despite being documented as 480p/720p only. An unsupported combination is caught locally with a clear error before the request goes out.

Reference media follows the shared [role hints](../media/video-generation#role-hints) — `start_frame`, `end_frame` and `reference`. The Seedance 2.0 family takes full multimodal references (reference images, video and audio); the 1.x models take start/end frames only, and `seedance-1-0-pro-fast-251015` takes a start frame only.

### Seedance here vs. Seedance via fal

Seedance is also reachable through [`@tanstack/ai-fal`](./fal), which proxies it alongside hundreds of other hosted models. This adapter talks to BytePlus directly, which means BytePlus billing and rate limits, model ids in BytePlus's own naming, and the first-class Seedance request fields above (`camera_fixed`, `draft`, `priority`, reference-media roles) rather than fal's normalized subset. Pick whichever matches the account you already have; there is no reason to install both just for Seedance.

## Image generation (Seedream)

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

`size` takes either a token (`1K`, `2K`, `4K`) or explicit pixels (`2048x2048`) — never a mix of the two. Pass image parts in the `prompt` array to edit or condition on existing images (up to 14 references, 10 on `dola-seedream-5-0-pro-260628`):

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

console.log(result.images.length)
```

Two behaviours surprise people:

- **`watermark` defaults to `true`.** BytePlus stamps "AI generated" into the bottom-right corner unless you pass `watermark: false`. The adapter never sets the field implicitly, so the provider default applies.
- **`numberOfImages` is an upper bound, not a count.** Seedream has no `n` parameter; asking for more than one image maps onto its group-image mode (`sequential_image_generation: 'auto'` with `max_images`), where the model decides how many images the prompt actually warrants. A request for four can come back with two, and the adapter logs a warning when it does.

Result URLs expire after 24 hours. Pass `response_format: 'b64_json'` in `modelOptions` to get the bytes inline instead.

## Text-to-speech (Seed Speech)

Seed Speech uses `BYTEPLUS_VOICE_API_KEY`, not the Ark key.

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

Seed Speech has **no top-level `speaker` field** — the voice travels inside a
`references` entry, so the adapter turns `voice` into
`references: [{ speaker: 'en_female_stokie_uranus_bigtts' }]` for you. The
consequence: `modelOptions.references` **replaces** that entry rather than
merging with it, so a request that passes `references` for voice cloning
silently drops `voice`. Include a `speaker` member yourself if you still want a
stock voice alongside your clips.

The suffix on a voice id tells you which generation you are asking for:

- `_uranus_bigtts` — TTS 2.0 voices, the current generation.
- `_mars_bigtts` / `_moon_bigtts` — TTS 1.0 voices.
- `*_emo_v2_*` — TTS 1.0 voices that additionally accept emotion tags.

The full roster lives in the [BytePlus voice list](https://docs.byteplus.com/en/docs/byteplusvoice/voicelist) and changes far more often than this package ships, so any string is accepted.

Output formats are `wav`, `mp3`, `pcm` and `ogg_opus`. Reach for `modelOptions` for `ogg_opus`, for an explicit `sample_rate`, for `references` (voice cloning — up to three 30-second audio clips, addressed from the text as `@Audio1`–`@Audio3`), for `watermark`, or for word-level timings:

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

Three things to plan around:

- **Synthesis is capped at 120 seconds of output.** The cap applies to `originalDuration` (the length before `speech_rate` is applied), which is also what BytePlus bills on.
- **Subtitle timings are milliseconds** while `duration` and `originalDuration` are seconds. The units genuinely differ.
- The `url` on the result expires roughly two hours after generation — persist the base64 `audio`, not the link.

The client half is the standard [`useGenerateSpeech` hook](../media/text-to-speech#streaming-mode-server-route--client-hook); nothing about it is BytePlus-specific.

## Transcription (Seed Speech ASR)

Also on the voice key. The endpoint is synchronous — audio in, transcript out, no polling:

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

Audio can be a `File`, base64, a data URL or a public URL, up to two hours and 100 MB. `enable_itn` renders spoken numbers and dates as digits, `enable_punc` inserts punctuation, `enable_ddc` strips fillers, and `enable_speaker_info` attaches speaker labels that surface as `segment.speaker`.

## Supported models

- **Chat** — `dola-seed-2-1-turbo-260628`, `seed-2-0-lite-260428`, `seed-2-0-mini-260428`, `seed-2-0-pro-260328`, `seed-2-0-lite-260228`, `seed-2-0-mini-260215`, `seed-2-0-code-preview-260328`, `seed-1-8-251228`, `seed-1-6-250915`, `seed-1-6-250615`, `seed-1-6-flash-250715`, `seed-1-6-flash-250615`, `glm-5-2-260617`, `glm-4-7-251222`, `deepseek-v4-pro-260425`, `deepseek-v4-flash-260425`, `deepseek-v3-2-251201`, `gpt-oss-120b-250805`.
- **Video** — `dreamina-seedance-2-0-260128`, `dreamina-seedance-2-0-fast-260128`, `dreamina-seedance-2-0-mini-260615`, `seedance-1-5-pro-251215`, `seedance-1-0-pro-250528`, `seedance-1-0-pro-fast-251015`.
- **Image** — `dola-seedream-5-0-pro-260628`, `seedream-5-0-260128`, `seedream-5-0-lite-260128`, `seedream-4-5-251128`, `seedream-4-0-250828`.
- **Speech** — `seed-audio-1.0` (TTS) and `seed-asr` (transcription).

BytePlus retires model ids aggressively and its published lists include ids that no longer resolve, so this package ships only dated ids that answered a live request. `BYTEPLUS_CHAT_MODELS`, `BYTEPLUS_VIDEO_MODELS`, `BYTEPLUS_IMAGE_MODELS`, `BYTEPLUS_TTS_MODELS` and `BYTEPLUS_TRANSCRIPTION_MODELS` are the authoritative lists and are exported for building model pickers.

## API Reference

Every factory has an environment-variable form and an explicit-key form.

### `byteplusText(model, config?)` / `createBytePlusText(model, apiKey, config?)`

Chat adapter for the Seed, GLM, DeepSeek and gpt-oss models. Reads `ARK_API_KEY` (or `BYTEPLUS_API_KEY`). `config.baseURL` overrides the region endpoint.

### `byteplusVideo(model, config?)` / `createBytePlusVideo(model, apiKey, config?)`

Seedance video adapter (experimental). Reads `ARK_API_KEY`.

### `byteplusImage(model, config?)` / `createBytePlusImage(model, apiKey, config?)`

Seedream image adapter. Reads `ARK_API_KEY`.

### `byteplusSpeech(model, config?)` / `createBytePlusSpeech(model, apiKey, config?)`

Seed Speech TTS adapter. Reads **`BYTEPLUS_VOICE_API_KEY`**.

### `byteplusTranscription(model, config?)` / `createBytePlusTranscription(model, apiKey, config?)`

Seed Speech transcription adapter. Reads **`BYTEPLUS_VOICE_API_KEY`**.

## Provider Tools

BytePlus does not expose provider-specific tool factories. Define your own with `toolDefinition()` from `@tanstack/ai` — Ark's tool calling is the standard OpenAI shape and works with the usual [tools flow](../tools/tools.md).

## Next Steps

- [Video Generation](../media/video-generation) — the full jobs/polling flow and the `useGenerateVideo` hook
- [Image Generation](../media/image-generation) — image-conditioned generation and role hints
- [Structured Outputs](../structured-outputs/one-shot) — schemas, validation and streaming
- [Other Adapters](./openai) — explore other providers
