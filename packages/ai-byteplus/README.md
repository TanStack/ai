# @tanstack/ai-byteplus

BytePlus ModelArk adapter for TanStack AI — Seed chat models, Seedance video
generation, Seedream image generation, and Seed Speech text-to-speech and
transcription.

## Installation

```bash
npm install @tanstack/ai-byteplus
# or
pnpm add @tanstack/ai-byteplus
# or
yarn add @tanstack/ai-byteplus
```

## Setup

BytePlus splits its models across two products with **two different API keys**:

```bash
# Ark (ModelArk): chat, Seedance video, Seedream image
export ARK_API_KEY="..."

# Seed Speech: text-to-speech and transcription — a separate product key
export BYTEPLUS_VOICE_API_KEY="..."
```

Ark keys are region-isolated. The default base URL is the Asia-Pacific
south-east endpoint (`https://ark.ap-southeast.bytepluses.com/api/v3`); per the
BytePlus docs the EU endpoint serves chat and image only (docs-derived — only
the ap-southeast host was exercised live).

## Why there's no Volcengine SDK dependency

This package does **not** depend on `@volcengine/ark-runtime` (or any other
first-party BytePlus/Volcengine SDK). That is deliberate:

- **Chat doesn't need one.** Ark's `/chat/completions` is OpenAI-compatible, so
  the chat adapter rides the `openai` SDK through `@tanstack/openai-base` — the
  same path `@tanstack/ai-grok` and `@tanstack/ai-groq` take, with identical
  dependencies. That reuses the shared streaming, tool-calling and
  structured-output machinery instead of forking it per provider.
- **Nothing else is OpenAI-shaped anyway.** Seedance video, Seedream image and
  Seed Speech are bespoke endpoints on two different hosts with two different
  auth headers. An SDK would not spare us the wire types; it would add a second
  dependency that still had to be translated at the boundary.

The cost is that the non-chat wire types are hand-written and pinned by tests
rather than generated. That is a considered trade, not an oversight — see
`src/video/wire-types.ts`, `src/image/wire-types.ts` and
`src/audio/wire-types.ts`, each of which records how its shape was verified.

## Usage

### Chat

```typescript
import { chat } from '@tanstack/ai'
import { byteplusText } from '@tanstack/ai-byteplus'

// The adapter carries the model — there is no separate `model` option.
const adapter = byteplusText('seed-2-0-lite-260428')

const text = await chat({
  adapter,
  messages: [{ role: 'user', content: 'Explain diffusion models briefly' }],
  stream: false,
})

console.log(text)
```

Drop `stream: false` to get the default streaming form, which yields
`StreamChunk`s you can iterate with `for await`.

Seed models reason by default. Reasoning arrives as a separate stream of
`reasoning_content` deltas and is surfaced as reasoning content, not answer
text. Pass `thinking: { type: 'disabled' }` in provider options to turn it off.

### Video (Seedance)

Seedance is an async task API, so `generateVideo()` only opens the job and
returns its `jobId`. Poll `getVideoJobStatus()` until the job settles — the
video URL arrives with the terminal status.

```typescript
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { byteplusVideo } from '@tanstack/ai-byteplus'

const adapter = byteplusVideo('seedance-1-5-pro-251215')

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

To let the core drive the whole lifecycle instead, pass `stream: true` and hand
the resulting chunk stream to your transport:

```typescript
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { byteplusVideo } from '@tanstack/ai-byteplus'

const stream = generateVideo({
  adapter: byteplusVideo('seedance-1-5-pro-251215'),
  prompt: 'a guitar being played in a store',
  stream: true,
  pollingInterval: 5000,
})

return toServerSentEventsResponse(stream)
```

**Generated video URLs expire after 24 hours** (the task record itself is kept
for 7 days), so download anything you need to keep.

### Image (Seedream)

```typescript
import { generateImage } from '@tanstack/ai'
import { byteplusImage } from '@tanstack/ai-byteplus'

const result = await generateImage({
  adapter: byteplusImage('seedream-4-0-250828'),
  prompt: 'a guitar being played in a store',
  size: '2K',
  modelOptions: { watermark: false },
})

console.log(result.images[0]?.url)
```

`size` takes either a token (`1K`, `2K`, `4K`) or explicit pixels
(`2048x2048`) — never a mix. Pass image parts in the `prompt` array to edit or
condition on existing images (up to 14 references, 10 on
`dola-seedream-5-0-pro-260628`).

Two behaviors surprise people:

- **`watermark` defaults to `true`.** BytePlus stamps "AI generated" into the
  bottom-right corner unless you pass `watermark: false`. The adapter never
  sets it implicitly, so the provider default applies.
- **`numberOfImages` is an upper bound, not a count.** Seedream has no `n`
  parameter; asking for more than one image maps to its group-image mode
  (`sequential_image_generation: 'auto'` with `max_images`), where the model
  decides how many images the prompt actually warrants. A request for four can
  return fewer, and the adapter logs a warning when it does.

Result URLs expire after 24 hours; pass `response_format: 'b64_json'` in
`modelOptions` to get bytes inline instead.

## Supported models

- **Chat** — `dola-seed-2-1-turbo-260628`, the `seed-2-0-*` family,
  `seed-1-8-251228`, the `seed-1-6-*` family, plus `glm-*`, `deepseek-*` and
  `gpt-oss-120b-250805`.
- **Video** — `dreamina-seedance-2-5-260628`,
  `dreamina-seedance-2-0-260128` (and `-fast-`/`-mini-`),
  `seedance-1-5-pro-251215`, `seedance-1-0-pro-250528`,
  `seedance-1-0-pro-fast-251015`.
- **Image** — `dola-seedream-5-0-pro-260628`, `seedream-5-0-260128`,
  `seedream-5-0-lite-260128`, `seedream-4-5-251128`, `seedream-4-0-250828`.
- **Speech** — `seed-audio-1.0` (TTS) and `seed-asr` (transcription).

BytePlus retires model ids aggressively, so only dated ids that were verified
live against the API are exported. (The two Seed Speech ids are the exception:
`seed-audio-1.0` is undated, `seed-asr` is a synthetic id for an
endpoint-addressed API that takes no `model` field, and neither could be
verified live pending a Seed Speech key.) `BYTEPLUS_CHAT_MODELS`,
`BYTEPLUS_VIDEO_MODELS`, `BYTEPLUS_IMAGE_MODELS`, `BYTEPLUS_TTS_MODELS` and
`BYTEPLUS_TRANSCRIPTION_MODELS` are the authoritative lists.

## Seedance: direct vs. via fal

Seedance is also reachable through `@tanstack/ai-fal`, which proxies it along
with hundreds of other models. This package talks to BytePlus directly, which
means BytePlus billing and rate limits, the first-class Seedance request fields
(`camera_fixed`, `generate_audio`, `watermark`, reference-image roles, …), and
model ids in BytePlus's own naming. Use whichever fits your account; there is
no reason to install both for Seedance alone.

## Seed Speech needs its own key

The TTS and transcription adapters do **not** talk to Ark. They use
`voice.ap-southeast-1.bytepluses.com` with an `X-Api-Key` header and the
Seed Speech product key (`BYTEPLUS_VOICE_API_KEY`). Passing an Ark key there
fails with `45000010 Invalid X-Api-Key`.

## License

MIT
