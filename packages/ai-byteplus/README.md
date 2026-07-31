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
south-east endpoint (`https://ark.ap-southeast.bytepluses.com/api/v3`); the EU
endpoint serves chat and image only.

## Usage

### Chat

```typescript
import { byteplusText } from '@tanstack/ai-byteplus'
import { generate } from '@tanstack/ai'

const adapter = byteplusText('seed-2-0-lite-260428')

const result = await generate({
  adapter,
  model: 'seed-2-0-lite-260428',
  messages: [{ role: 'user', content: 'Explain diffusion models briefly' }],
})

console.log(result.text)
```

Seed models reason by default. Reasoning arrives as a separate stream of
`reasoning_content` deltas and is surfaced as reasoning content, not answer
text. Pass `thinking: { type: 'disabled' }` in provider options to turn it off.

### Video (Seedance)

```typescript
import { byteplusVideo } from '@tanstack/ai-byteplus'
import { generateVideo } from '@tanstack/ai'

const result = await generateVideo({
  adapter: byteplusVideo('seedance-1-5-pro-251215'),
  model: 'seedance-1-5-pro-251215',
  prompt: 'a guitar being played in a store',
  size: '16:9_720p',
  duration: 5,
})

console.log(result.url)
```

Seedance runs as an async task: the adapter creates the task, polls it, then
reads the result URL. **Generated video URLs expire after 24 hours** (the task
record itself is kept for 7 days), so download anything you need to keep.

## Supported models

- **Chat** — `dola-seed-2-1-turbo-260628`, the `seed-2-0-*` family,
  `seed-1-8-251228`, the `seed-1-6-*` family, plus `glm-*`, `deepseek-*` and
  `gpt-oss-120b-250805`.
- **Video** — `dreamina-seedance-2-0-260128` (and `-fast-`/`-mini-`),
  `seedance-1-5-pro-251215`, `seedance-1-0-pro-250528`,
  `seedance-1-0-pro-fast-251015`.
- **Image** — `dola-seedream-5-0-pro-260628`, `seedream-5-0-260128`,
  `seedream-5-0-lite-260128`, `seedream-4-5-251128`, `seedream-4-0-250828`.
- **Speech** — `seed-audio-1.0` (TTS) and `seed-asr` (transcription).

BytePlus retires model ids aggressively, so only dated ids that were verified
live against the API are exported. `BYTEPLUS_CHAT_MODELS`,
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
