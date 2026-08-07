---
title: fal.ai
id: fal-adapter
description: "Images, video, audio, TTS, and transcription on fal.ai via @tanstack/ai-fal."
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

If you need fal media → install, set `FAL_KEY`, pass a **string-literal** model id to the matching factory.

**Has:** `generateImage`, `generateVideo`, `generateAudio`, `generateSpeech`, `generateTranscription`.  
**Does not:** `chat()`, tools, `summarize()`.

Example app: [ts-react-media](https://github.com/TanStack/ai/tree/main/examples/ts-react-media).

## Install

```bash
npm install @tanstack/ai-fal
```

```bash
FAL_KEY=your-fal-api-key
```

## Type safety

Pass model IDs as **string literals** for autocomplete on `size` / `modelOptions`. Variables lose inference; unknown new ids still work without types.

```typescript
import { falImage } from "@tanstack/ai-fal";

const adapter = falImage("fal-ai/z-image/turbo"); // good
```

## Image

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

### Explicit key / proxy

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

const adapter = falImage("fal-ai/flux/dev", {
  apiKey: process.env.FAL_KEY!,
  // proxyUrl: "https://your-server.com/api/fal/proxy",
});

const result = await generateImage({
  adapter,
  prompt: "A futuristic cityscape at sunset",
  numberOfImages: 1,
});
```

### With size + model options

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

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

```typescript
import { generateImage } from "@tanstack/ai";
import { falImage } from "@tanstack/ai-fal";

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

### Size mapping

| Form | Example | Maps to |
|------|---------|---------|
| named | `"landscape_16_9"` | `image_size` |
| width×height | `"1536x1024"` | `image_size` |
| ratio + res | `"16:9_4K"` | `aspect_ratio` + `resolution` |
| ratio only | `"16:9"` | `aspect_ratio` |

## Video (experimental)

Queue: submit → poll → URL. Duration not mapped by adapter top-level (use `modelOptions`).

```typescript
import { generateVideo, getVideoJobStatus } from "@tanstack/ai";
import { falVideo } from "@tanstack/ai-fal";

const adapter = falVideo("fal-ai/kling-video/v2.6/pro/text-to-video");

const job = await generateVideo({
  adapter,
  prompt: "A timelapse of a flower blooming",
  size: "16:9",
  modelOptions: {
    duration: "5",
  },
});

const status = await getVideoJobStatus({
  adapter,
  jobId: job.jobId,
});

console.log(status.status);
```

### Image-to-video

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

## Text-to-speech

Audio returned as base64 (`result.audio`).

```typescript
import { generateSpeech } from "@tanstack/ai";
import { falSpeech } from "@tanstack/ai-fal";

const result = await generateSpeech({
  adapter: falSpeech("fal-ai/kokoro/american-english"),
  text: "Hello from fal!",
  voice: "af_heart",
  speed: 1.0,
});

console.log(result.format, result.contentType);
```

### Gemini 3.1 Flash TTS

Embed style tags in text. Newer than `@fal-ai/client` types — works, no `modelOptions` autocomplete.

```typescript
import { generateSpeech } from "@tanstack/ai";
import { falSpeech } from "@tanstack/ai-fal";

const result = await generateSpeech({
  adapter: falSpeech("fal-ai/gemini-3.1-flash-tts"),
  text: "[warm, enthusiastic] Welcome to TanStack AI! [pause] Let's build something great.",
  voice: "Kore",
});
```

### ElevenLabs v3

```typescript
import { generateSpeech } from "@tanstack/ai";
import { falSpeech } from "@tanstack/ai-fal";

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

`audio`: URL, `Blob`, `File`, or `ArrayBuffer`.

```typescript
import { generateTranscription } from "@tanstack/ai";
import { falTranscription } from "@tanstack/ai-fal";

const result = await generateTranscription({
  adapter: falTranscription("fal-ai/whisper"),
  audio: "https://example.com/recording.mp3",
  language: "en",
});

console.log(result.text);
for (const segment of result.segments ?? []) {
  console.log(`[${segment.start}s → ${segment.end}s] ${segment.text}`);
}
```

## Audio (music / SFX)

Result URL at `result.audio.url`.

```typescript
import { generateAudio } from "@tanstack/ai";
import { falAudio } from "@tanstack/ai-fal";

const music = await generateAudio({
  adapter: falAudio("fal-ai/minimax-music/v2.6"),
  prompt: "City Pop, 80s retro, groovy synth bass, warm female vocal, 104 BPM",
});

console.log(music.audio.url);
```

```typescript
import { generateAudio } from "@tanstack/ai";
import { falAudio } from "@tanstack/ai-fal";

const lyrical = await generateAudio({
  adapter: falAudio("fal-ai/diffrhythm"),
  prompt: "An upbeat electronic track with synths",
  modelOptions: {
    lyrics: "[verse]\nHello world\n[chorus]\nLa la la",
  },
});
```

```typescript
import { generateAudio } from "@tanstack/ai";
import { falAudio } from "@tanstack/ai-fal";

const sfx = await generateAudio({
  adapter: falAudio("fal-ai/elevenlabs/sound-effects/v2"),
  prompt: "Thunderclap with rain",
  duration: 5,
});
```

## Popular models

### Image

| Model | Notes |
|-------|--------|
| `fal-ai/nano-banana-pro` | Fast 4K |
| `fal-ai/flux-2/klein/9b` | Realism, text |
| `fal-ai/z-image/turbo` | Fast 6B |
| `xai/grok-imagine-image` | Aesthetic |

### Video

| Model | Mode |
|-------|------|
| `fal-ai/kling-video/v2.6/pro/text-to-video` | T2V |
| `fal-ai/kling-video/v2.6/pro/image-to-video` | I2V |
| `fal-ai/veo3.1` / `.../image-to-video` | Veo |
| `xai/grok-imagine-video/text-to-video` / `.../image-to-video` | xAI |
| `fal-ai/ltx-2/text-to-video/fast` / `.../image-to-video/fast` | Fast |

### TTS / STT / audio

TTS: `fal-ai/gemini-3.1-flash-tts`, `fal-ai/elevenlabs/tts/eleven-v3`, `fal-ai/elevenlabs/tts/turbo-v2.5`, `fal-ai/minimax/speech-2.6-hd`, `fal-ai/kokoro/*`, and more.

STT: `fal-ai/whisper`, `fal-ai/wizper`, `fal-ai/speech-to-text/turbo`, `fal-ai/elevenlabs/speech-to-text`.

Music/SFX: `fal-ai/minimax-music/v2.6`, `fal-ai/diffrhythm`, `fal-ai/lyria2`, `fal-ai/elevenlabs/sound-effects/v2`, …

Very new models may lack `@fal-ai/client` types — string ids still work.

## API reference

| Factory | Activity |
| --- | --- |
| `falImage(model, config?)` | `generateImage()` |
| `falVideo(model, config?)` | `generateVideo()` / `getVideoJobStatus()` |
| `falSpeech(model, config?)` | `generateSpeech()` → base64 audio |
| `falTranscription(model, config?)` | `generateTranscription()` |
| `falAudio(model, config?)` | `generateAudio()` → URL |
| `getFalApiKeyFromEnv()` | Reads `FAL_KEY` |
| `configureFalClient(config?)` | Underlying client setup |

`config`: `apiKey?`, `proxyUrl?`.

## Notes

- No chat / tools / summarization
- Video API may change

## Next steps

- [Getting Started](../getting-started/quick-start)
- [Other Adapters](./openai)
