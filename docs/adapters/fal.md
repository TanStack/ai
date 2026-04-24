---
title: fal.ai
id: fal-adapter
description: "Generate images and videos with 600+ models on fal.ai using TanStack AI — Nano Banana Pro, FLUX, and more via the @tanstack/ai-fal adapter."
keywords:
  - tanstack ai
  - fal.ai
  - fal
  - image generation
  - video generation
  - flux
  - nano banana
  - adapter
---

The fal.ai adapter provides access to 600+ models on the fal.ai platform for image, video, audio, speech, and transcription. Unlike text-focused adapters, the fal adapter is **media-focused** — it supports `generateImage()`, `generateVideo()`, `generateAudio()`, `generateSpeech()`, and `generateTranscription()` but does not support `chat()` or tools.

For a full working example, see the [fal.ai example app](https://github.com/TanStack/ai/tree/main/examples/ts-react-media).

## Installation

```bash
npm install @tanstack/ai-fal
```

## Type Safety with String Literals

The fal adapter provides full type safety when you pass the model ID as a **string literal**. This gives you autocomplete for `size` and `modelOptions` specific to that model. Always use string literals — not variables — when creating adapters:

```typescript
// Good — full type safety and autocomplete
const adapter = falImage("fal-ai/z-image/turbo");

// Bad — no type inference for model-specific options
const modelId = "fal-ai/z-image/turbo";
const adapter = falImage(modelId);
```

You can also pass any string for new models that fal.ai hasn't provided types for yet — you just won't get type safety on those endpoints.

## Basic Usage

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

const result = await generateImage({
  adapter: falImage("fal-ai/flux/dev"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
});

console.log(result.images);
```

## Basic Usage - Custom API Key

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

const adapter = falImage("fal-ai/flux/dev", {
  apiKey: process.env.FAL_KEY!,
});

const result = await generateImage({
  adapter,
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
});
```

## Configuration

```typescript
import { falImage, type FalClientConfig } from "@tanstack/ai-fal";

// Direct API key
const adapter = falImage("fal-ai/flux/dev", {
  apiKey: "your-api-key",
});

// Using a proxy URL (for client-side usage)
const proxiedAdapter = falImage("fal-ai/flux/dev", {
  apiKey: "your-api-key",
  proxyUrl: "https://your-server.com/api/fal/proxy",
});
```

## Example: Image Generation

From the [fal.ai example app](https://github.com/TanStack/ai/tree/main/examples/ts-react-media):

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

// Use string literals for the model to get full type safety
const result = await generateImage({
  adapter: falImage("fal-ai/nano-banana-pro"),
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
  size: "16:9_4K",
  modelOptions: {
    output_format: "jpeg",
  },
});
```

## Example: Image with Model Options

Each fal.ai model has its own type-safe options. The adapter uses fal.ai's types to provide autocomplete and type checking for model-specific parameters. There are 1000s of combinations. If you provide the proper model endpoint id as as string literal, you will then only be able to provide `size` and `modelOptions` that the model supports.

_IMPORTANT_: It is possible to pass strings and new endpoint ids that Fal has not provided types for. You just won't get type safety on those endpoints. You'll find this happens for very new models.

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

// Model-specific options are type-safe
const result = await generateImage({
  adapter: falImage("fal-ai/z-image/turbo"),
  prompt: "A serene mountain landscape",
  numberOfImages: 1,
  size: "landscape_16_9",
  modelOptions: {
    acceleration: "high",
    enable_prompt_expansion: true,
  },
});
```

## Image Size Options

The fal adapter supports a flexible `size` paramater that maps either to `image_size` or to `aspect_ratio` and `resolution` parameters:

|  | `size` | Maps To |
|--------|---------|---------|
| named | `"landscape_16_9"` | `image_size: "landscape_16_9"` |
| width x height (OpenAI) | `"1536x1024"` | | `image_size: "1536x1024"` |
| aspect ratio & resolution | `"16:9_4K"` | `aspect_ratio: "16:9"`, `resolution: "4K"` |
| aspect ratio only | `"16:9"` | `aspect_ratio: "16:9"` |

```typescript
// Aspect ratio only
size: "16:9"

// Aspect ratio with resolution
size: "16:9_4K"

// Named size (model-specific)
size: "landscape_16_9"
```

## Video Generation (Experimental)

> **Note:** Video generation is an experimental feature and may change in future releases. In particular, this version of the adapter does not map the duration paramater

Video generation uses a queue-based workflow: submit a job, poll for status, then retrieve the video URL when complete.

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { falVideo } from "@tanstack/ai-fal";
```

## Example: Text-to-Video

From the [fal.ai example app](https://github.com/TanStack/ai/tree/main/examples/ts-react-media):

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { falVideo } from "@tanstack/ai-fal";

// 1. Submit the video generation job
const adapter = falVideo("fal-ai/kling-video/v2.6/pro/text-to-video");

const job = await generateVideo({
  adapter,
  prompt: "A timelapse of a flower blooming",
  size: "16:9_1080p",
  modelOptions: {
    duration: "5",
  },
});

// 2. Poll for status
const status = await getVideoJobStatus({
  adapter,
  jobId: job.jobId,
});

console.log(status.status); // "pending" | "processing" | "completed"
```

## Example: Image-to-Video

```typescript
import { generateVideo } from "@tanstack/ai";
import { falVideo } from "@tanstack/ai-fal";

const job = await generateVideo({
  adapter: falVideo("fal-ai/kling-video/v2.6/pro/image-to-video"),
  prompt: "Animate this scene with gentle wind",
  modelOptions: {
    start_image_url: "https://example.com/image.jpg",
    generate_audio: true,
    duration: "5",
  },
});
```

## Text-to-Speech

Text-to-speech uses `falSpeech()` with the `generateSpeech()` activity. The adapter fetches the generated audio from fal's CDN and returns it as base64-encoded data to match the `TTSResult` contract.

```typescript
import { generateSpeech } from "@tanstack/ai";
import { falSpeech } from "@tanstack/ai-fal";

const result = await generateSpeech({
  adapter: falSpeech("fal-ai/kokoro/american-english"),
  text: "Hello from fal!",
  voice: "af_heart",
  speed: 1.0,
});

// result.audio is a base64-encoded string
console.log(result.format); // e.g. "wav"
console.log(result.contentType); // e.g. "audio/wav"
```

### Google Gemini 3.1 Flash TTS

Google's newest TTS model (`fal-ai/gemini-3.1-flash-tts`) supports 80+ languages and introduces **granular audio tags** for expressive control — you can embed speaker tags and style cues directly in the text.

```typescript
const result = await generateSpeech({
  adapter: falSpeech("fal-ai/gemini-3.1-flash-tts"),
  text: "[warm, enthusiastic] Welcome to TanStack AI! [pause] Let's build something great.",
  voice: "Kore",
});
```

> **Note:** This model is newer than `@fal-ai/client@1.9.1`'s type map, so `modelOptions` won't autocomplete. The call still works — the fal adapter accepts any model ID as a string. Type-safe autocomplete will land when fal's SDK types catch up.

### ElevenLabs v3

```typescript
const result = await generateSpeech({
  adapter: falSpeech("fal-ai/elevenlabs/tts/eleven-v3"),
  text: "Welcome to TanStack AI.",
  modelOptions: {
    voice: "Rachel",
    stability: 0.5,
  },
});
```

## Transcription

Speech-to-text uses `falTranscription()` with the `generateTranscription()` activity. The `audio` input accepts a URL string, `Blob`, `File`, or `ArrayBuffer` — `ArrayBuffer` is automatically wrapped in a `Blob` for upload.

```typescript
import { generateTranscription } from "@tanstack/ai";
import { falTranscription } from "@tanstack/ai-fal";

const result = await generateTranscription({
  adapter: falTranscription("fal-ai/whisper"),
  audio: "https://example.com/recording.mp3",
  language: "en",
});

console.log(result.text);
console.log(result.language);

// When the model returns word/segment timestamps, they're mapped to result.segments
for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s → ${segment.end}s] ${segment.text}`);
}
```

## Audio Generation (Music & Sound Effects)

Music and sound-effect generation uses `falAudio()` with the `generateAudio()` activity. Unlike TTS, the result is returned as a URL in `result.audio.url` (you can fetch it yourself if you need raw bytes).

```typescript
import { generateAudio } from "@tanstack/ai";
import { falAudio } from "@tanstack/ai-fal";

// Music generation with MiniMax Music 2.6 (latest)
const music = await generateAudio({
  adapter: falAudio("fal-ai/minimax-music/v2.6"),
  prompt: "City Pop, 80s retro, groovy synth bass, warm female vocal, 104 BPM, nostalgic urban night",
});

console.log(music.audio.url);
```

```typescript
// DiffRhythm with explicit lyrics
const lyrical = await generateAudio({
  adapter: falAudio("fal-ai/diffrhythm"),
  prompt: "An upbeat electronic track with synths",
  modelOptions: {
    lyrics: "[verse]\nHello world\n[chorus]\nLa la la",
  },
});
```

```typescript
// Sound effects
const sfx = await generateAudio({
  adapter: falAudio("fal-ai/elevenlabs/sound-effects/v2"),
  prompt: "Thunderclap with rain",
  duration: 5,
});
```

## Popular Models

### Image Models

| Model | Description |
|-------|-------------|
| `fal-ai/nano-banana-pro` | Fast, high-quality image generation (4K) |
| `fal-ai/flux-2/klein/9b` | Enhanced realism, crisp text generation |
| `fal-ai/z-image/turbo` | Super fast 6B parameter model |
| `xai/grok-imagine-image` | xAI highly aesthetic images with prompt enhancement |

### Video Models

| Model | Mode | Description |
|-------|------|-------------|
| `fal-ai/kling-video/v2.6/pro/text-to-video` | Text-to-Video | High-quality text-to-video |
| `fal-ai/kling-video/v2.6/pro/image-to-video` | Image-to-Video | Animate images with Kling |
| `fal-ai/veo3.1` | Text-to-Video | Google Veo text-to-video |
| `fal-ai/veo3.1/image-to-video` | Image-to-Video | Google Veo image-to-video |
| `xai/grok-imagine-video/text-to-video` | Text-to-Video | xAI video from text |
| `xai/grok-imagine-video/image-to-video` | Image-to-Video | xAI animate images to video |
| `fal-ai/ltx-2/text-to-video/fast` | Text-to-Video | Fast text-to-video |
| `fal-ai/ltx-2/image-to-video/fast` | Image-to-Video | Fast image-to-video animation |

### Text-to-Speech Models

| Model | Description |
|-------|-------------|
| `fal-ai/gemini-3.1-flash-tts` | **New** — Google's flagship TTS with 80+ languages and expressive audio tags |
| `fal-ai/elevenlabs/tts/eleven-v3` | ElevenLabs v3 expressive multi-voice TTS |
| `fal-ai/elevenlabs/tts/turbo-v2.5` | Low-latency ElevenLabs TTS |
| `fal-ai/minimax/speech-2.6-hd` | MiniMax HD speech synthesis |
| `fal-ai/minimax/speech-2.6-turbo` | MiniMax low-latency variant |
| `fal-ai/kokoro/american-english` | Kokoro multilingual TTS — also `british-english`, `french`, `spanish`, `italian`, `japanese`, `mandarin-chinese`, `hindi`, `brazilian-portuguese` |
| `fal-ai/inworld-tts` | Inworld TTS-1.5 Max |
| `fal-ai/chatterbox/text-to-speech/multilingual` | Chatterbox multilingual TTS |
| `fal-ai/dia-tts` | Dia expressive dialogue TTS |
| `fal-ai/orpheus-tts` | Orpheus open-source TTS |
| `fal-ai/f5-tts` | F5-TTS voice cloning |
| `fal-ai/vibevoice/7b` | VibeVoice 7B conversational TTS |

### Transcription Models

| Model | Description |
|-------|-------------|
| `fal-ai/whisper` | OpenAI Whisper on fal infra |
| `fal-ai/wizper` | Faster-whisper variant with word-level timestamps |
| `fal-ai/speech-to-text/turbo` | Turbo STT with diarization |
| `fal-ai/elevenlabs/speech-to-text` | ElevenLabs STT |

### Audio / Music Models

| Model | Mode | Description |
|-------|------|-------------|
| `fal-ai/minimax-music/v2.6` | Music | **New** — MiniMax Music 2.6, full vocal + instrumental compositions from a prompt |
| `fal-ai/minimax-music/v2.5` | Music | MiniMax Music 2.5 |
| `fal-ai/minimax-music/v2` | Music | MiniMax Music v2 — supports `lyrics_prompt` |
| `fal-ai/diffrhythm` | Music | DiffRhythm — prompt + lyrics |
| `fal-ai/lyria2` | Music | Google Lyria 2 high-fidelity music |
| `fal-ai/stable-audio-25/text-to-audio` | Music / Audio | Stability AI Stable Audio 2.5 |
| `fal-ai/mmaudio-v2/text-to-audio` | Audio | MMAudio v2 text-to-audio |
| `fal-ai/elevenlabs/sound-effects/v2` | SFX | ElevenLabs sound-effect generation |
| `fal-ai/beatoven/sound-effect-generation` | SFX | Beatoven professional sound effects |
| `fal-ai/thinksound` | Audio | Thinksound reasoning-based audio generation |

> **Very new models** (e.g. `gemini-3.1-flash-tts`, `minimax-music/v2.6`, `beatoven/sound-effect-generation`) may not yet appear in `@fal-ai/client`'s type map — they still work as plain string model IDs, you just won't get autocomplete for their `modelOptions`.

## Environment Variables

Create an API key at [fal.ai](https://fal.ai) and set it in your environment:

```bash
FAL_KEY=your-fal-api-key
```

## API Reference

### `falImage(model, config?)`

Creates a fal.ai image adapter using the `FAL_KEY` environment variable or an explicit config.

**Parameters:**

- `model` - The fal.ai model ID (e.g., `"fal-ai/flux/dev"`)
- `config.apiKey?` - Your fal.ai API key (falls back to `FAL_KEY` env var)
- `config.proxyUrl?` - Proxy URL for client-side usage

**Returns:** A `FalImageAdapter` instance for use with `generateImage()`.

### `createFalImage(model, config?)`

Alias for `falImage()`.

### `falVideo(model, config?)`

Creates a fal.ai video adapter using the `FAL_KEY` environment variable or an explicit config.

**Parameters:**

- `model` - The fal.ai model ID (e.g., `"fal-ai/kling-video/v2.6/pro/text-to-video"`)
- `config.apiKey?` - Your fal.ai API key (falls back to `FAL_KEY` env var)
- `config.proxyUrl?` - Proxy URL for client-side usage

**Returns:** A `FalVideoAdapter` instance for use with `generateVideo()` and `getVideoJobStatus()`.

### `createFalVideo(model, config?)`

Alias for `falVideo()`.

### `falSpeech(model, config?)`

Creates a fal.ai text-to-speech adapter.

**Parameters:**

- `model` - The fal.ai TTS model ID (e.g., `"fal-ai/kokoro/american-english"`)
- `config.apiKey?` - Your fal.ai API key (falls back to `FAL_KEY` env var)
- `config.proxyUrl?` - Proxy URL for client-side usage

**Returns:** A `FalSpeechAdapter` instance for use with `generateSpeech()`. The adapter fetches the generated audio URL from fal and returns it as base64 in `result.audio`.

### `falTranscription(model, config?)`

Creates a fal.ai transcription (speech-to-text) adapter.

**Parameters:**

- `model` - The fal.ai STT model ID (e.g., `"fal-ai/whisper"`)
- `config.apiKey?` - Your fal.ai API key (falls back to `FAL_KEY` env var)
- `config.proxyUrl?` - Proxy URL for client-side usage

**Returns:** A `FalTranscriptionAdapter` instance for use with `generateTranscription()`.

### `falAudio(model, config?)`

Creates a fal.ai audio generation adapter (music and sound effects).

**Parameters:**

- `model` - The fal.ai audio model ID (e.g., `"fal-ai/diffrhythm"`, `"fal-ai/minimax-music/v2"`)
- `config.apiKey?` - Your fal.ai API key (falls back to `FAL_KEY` env var)
- `config.proxyUrl?` - Proxy URL for client-side usage

**Returns:** A `FalAudioAdapter` instance for use with `generateAudio()`. The result contains a URL at `result.audio.url`.

### `getFalApiKeyFromEnv()`

Reads the `FAL_KEY` environment variable. Throws if not set.

**Returns:** The API key string.

### `configureFalClient(config?)`

Configures the underlying `@fal-ai/client`. Called automatically by adapter constructors. Uses `proxyUrl` if provided, otherwise sets credentials from the API key.

## Limitations

- **No text/chat support** — Use OpenAI, Anthropic, Gemini, or another text adapter for `chat()`
- **No tools support** — Tool definitions are not applicable to media generation
- **No summarization** — Use a text adapter for `summarize()`
- **Video is experimental** — The video generation API may change in future releases

## Next Steps

- [Getting Started](../getting-started/quick-start) - Learn the basics
- [Other Adapters](./openai) - Explore other providers
